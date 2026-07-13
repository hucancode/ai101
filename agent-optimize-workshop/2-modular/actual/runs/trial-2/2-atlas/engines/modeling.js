// modeling engine — solids you compose by their faces.
//
// Two builders (`extrude`, `lathe`) are the ONLY things in the system that emit
// triangles. Three cores (`box`, `cylinder`, `halfCylinder`) are cached calls into
// them. Every solid is centred on its own bounding box and comes back as a HANDLE:
//   { unit, rot, scale, id, faces }   — unit mesh shared per proportions,
//                                        w/h/d/r are pure scale.
// Faces are named frames { pos, n, u, v, sec } with u x v = n; `seat` is the single
// placement primitive. Parts (`piece`/`join`/`anchor`/`mount`/`finish`) never write
// a coordinate.

import {
  THREE, TAU, HPI, clamp,
  vAdd, vSub, vScale, vLen, vNorm, vCross,
  m3AxisAngle, alignY, geometryOf,
} from "../gfx.js";

// ---------------------------------------------------------------------------
// tunables
// ---------------------------------------------------------------------------

const LATHE_SEGS_FULL = 32;  // segments for a full revolution; scaled by arc/TAU
const CURVE_SAMPLES = 16;    // samples along a bent box top
const EPS = 1e-9;
const DEGENERATE_AREA = 1e-12; // triangles below this are dropped, not emitted

// ---------------------------------------------------------------------------
// outlines
// ---------------------------------------------------------------------------
// A point is [x, y] or [x, y, smooth] or { x, y, smooth }. An outline is a CLOSED
// loop (do not repeat the first point) wound counter-clockwise; a point flagged
// `smooth` averages its two edge normals so arcs shade round and rims stay crisp.

export const point = (x, y, smooth = false) => ({ x, y, smooth: !!smooth });

function toPts(outline) {
  if (!Array.isArray(outline) || outline.length < 3)
    throw new Error(`outline needs >= 3 points, got ${outline && outline.length}`);
  const pts = outline.map((p, i) => {
    const q = Array.isArray(p)
      ? { x: p[0], y: p[1], smooth: !!p[2] }
      : { x: p.x, y: p.y, smooth: !!p.smooth };
    if (!Number.isFinite(q.x) || !Number.isFinite(q.y))
      throw new Error(`outline point ${i} is not finite: ${JSON.stringify(p)}`);
    return q;
  });
  // A CW loop would turn every edge normal inward; wind it CCW up front so the
  // "-90 degrees" normal rule is the one true source of outwardness.
  if (signedArea(pts) < 0) pts.reverse();
  if (Math.abs(signedArea(pts)) < EPS)
    throw new Error("outline has zero area");
  const s = starMargin(pts);
  if (s <= 1e-4)
    throw new Error(
      `outline is not star-shaped about its centroid (margin ${s.toExponential(2)}); ` +
      "the caps are fanned from it, so a fold there would emit backwards triangles",
    );
  return pts;
}

// How safely can every edge be seen from the centroid? The fan triangle
// (centroid, p, q) must wind CCW for every edge; the margin is the worst such
// cross product, normalised by the outline's size so it reads as a shape property.
export function starMargin(pts) {
  const c = centroid2(pts);
  let lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
  for (const p of pts) {
    lo[0] = Math.min(lo[0], p.x); hi[0] = Math.max(hi[0], p.x);
    lo[1] = Math.min(lo[1], p.y); hi[1] = Math.max(hi[1], p.y);
  }
  const d2 = (hi[0] - lo[0]) ** 2 + (hi[1] - lo[1]) ** 2;
  if (d2 < EPS) return 0;
  let worst = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    worst = Math.min(worst, ((p.x - c.x) * (q.y - c.y) - (p.y - c.y) * (q.x - c.x)) / d2);
  }
  return worst;
}

function signedArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

// area centroid — the fan origin for caps. The outline must be star-shaped about it.
function centroid2(pts) {
  let cx = 0, cy = 0, a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    const cr = p.x * q.y - q.x * p.y;
    a += cr; cx += (p.x + q.x) * cr; cy += (p.y + q.y) * cr;
  }
  a *= 0.5;
  if (Math.abs(a) < EPS) throw new Error("outline has zero area");
  return { x: cx / (6 * a), y: cy / (6 * a) };
}

// edge i runs pts[i] -> pts[i+1]; its outward normal is its direction turned -90.
function edgeNormals(pts) {
  const n = pts.length;
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    const dx = q.x - p.x, dy = q.y - p.y;
    const L = Math.hypot(dx, dy);
    if (L < EPS) throw new Error(`outline edge ${i} has zero length`);
    out[i] = [dy / L, -dx / L]; // turn -90
  }
  return out;
}

// per-edge-END normals: a smooth point averages its two edges, a crisp one keeps
// the edge's own normal (so the vertex is duplicated across the rim).
function vertexNormals(pts, en) {
  const n = pts.length;
  const start = new Array(n), end = new Array(n); // per edge i
  for (let i = 0; i < n; i++) {
    const prev = (i + n - 1) % n, next = (i + 1) % n;
    start[i] = pts[i].smooth ? avg2(en[prev], en[i]) : en[i];
    end[i] = pts[next].smooth ? avg2(en[i], en[next]) : en[i];
  }
  return { start, end };
}

function avg2(a, b) {
  const x = a[0] + b[0], y = a[1] + b[1];
  const L = Math.hypot(x, y);
  if (L < EPS) return a.slice(); // 180-degree fold: keep the edge's own normal
  return [x / L, y / L];
}

// ---------------------------------------------------------------------------
// triangle soup + winding repair
// ---------------------------------------------------------------------------

function soup() {
  return { pos: [], nrm: [], count: 0 };
}

// Push one triangle with its intended outward normals. The winding is REPAIRED
// here: a triangle whose winding disagrees with its own outward normal is flipped,
// and a degenerate one is dropped. An inside-out or hollow mesh is therefore not
// expressible, not merely discouraged.
function tri(s, a, b, c, na, nb, nc) {
  const g = vCross(vSub(b, a), vSub(c, a));
  const area = vLen(g);
  if (area < DEGENERATE_AREA) return;
  const ref = vAdd(vAdd(na, nb), nc);
  if (g[0] * ref[0] + g[1] * ref[1] + g[2] * ref[2] < 0) {
    // swap b/c: winding now agrees with the outward normal
    const t = b; b = c; c = t;
    const tn = nb; nb = nc; nc = tn;
  }
  s.pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  s.nrm.push(na[0], na[1], na[2], nb[0], nb[1], nb[2], nc[0], nc[1], nc[2]);
  s.count++;
}

export function signedVolume(positions) {
  let v = 0;
  for (let i = 0; i < positions.length; i += 9) {
    const ax = positions[i], ay = positions[i + 1], az = positions[i + 2];
    const bx = positions[i + 3], by = positions[i + 4], bz = positions[i + 5];
    const cx = positions[i + 6], cy = positions[i + 7], cz = positions[i + 8];
    v += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  }
  return v / 6;
}

// Normalise a raw soup into a UNIT mesh: bbox-centred, every extent 1. The real
// size then rides on the handle's scale, so proportions (and only proportions)
// pick the shared mesh.
function unitize(s) {
  const p = s.pos;
  if (!p.length) throw new Error("builder produced no triangles");
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.length; i += 3)
    for (let k = 0; k < 3; k++) {
      if (p[i + k] < lo[k]) lo[k] = p[i + k];
      if (p[i + k] > hi[k]) hi[k] = p[i + k];
    }
  const ext = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
  const ctr = [(hi[0] + lo[0]) / 2, (hi[1] + lo[1]) / 2, (hi[2] + lo[2]) / 2];
  for (let k = 0; k < 3; k++)
    if (ext[k] < EPS) throw new Error(`solid is flat on axis ${k} (extent ${ext[k]})`);

  const pos = new Float32Array(p.length);
  const nrm = new Float32Array(p.length);
  for (let i = 0; i < p.length; i += 3) {
    for (let k = 0; k < 3; k++) pos[i + k] = (p[i + k] - ctr[k]) / ext[k];
    // a diagonal scale S transforms normals by S^-T = 1/s per axis
    const nx = s.nrm[i] / ext[0], ny = s.nrm[i + 1] / ext[1], nz = s.nrm[i + 2] / ext[2];
    const L = Math.hypot(nx, ny, nz) || 1;
    nrm[i] = nx / L; nrm[i + 1] = ny / L; nrm[i + 2] = nz / L;
  }

  const vol = signedVolume(pos);
  if (!(vol > 0))
    throw new Error(`mesh is inside-out or hollow: signed volume ${vol}`);
  return { positions: pos, normals: nrm, tris: s.count, volume: vol, ext };
}

// ---------------------------------------------------------------------------
// the two builders
// ---------------------------------------------------------------------------

// outline in XY, pushed along Z. Caps are fanned from the centroid.
function rawExtrude(pts, depth) {
  if (!(depth > 0)) throw new Error(`extrude depth must be > 0, got ${depth}`);
  const n = pts.length;
  const en = edgeNormals(pts);
  const vn = vertexNormals(pts, en);
  const c = centroid2(pts);
  const z0 = -depth / 2, z1 = depth / 2;
  const s = soup();

  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    const n0 = [vn.start[i][0], vn.start[i][1], 0];
    const n1 = [vn.end[i][0], vn.end[i][1], 0];
    const a = [p.x, p.y, z0], b = [q.x, q.y, z0];
    const cc = [q.x, q.y, z1], d = [p.x, p.y, z1];
    tri(s, a, b, cc, n0, n1, n1);
    tri(s, a, cc, d, n0, n1, n0);
  }
  const up = [0, 0, 1], dn = [0, 0, -1];
  const cf = [c.x, c.y, z1], cb = [c.x, c.y, z0];
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    tri(s, cf, [p.x, p.y, z1], [q.x, q.y, z1], up, up, up);
    tri(s, cb, [q.x, q.y, z0], [p.x, p.y, z0], dn, dn, dn);
  }
  return s;
}

// outline in XY (x = radius >= 0, y = height) revolved about +Y through `arc`.
// A point on the axis (x == 0) makes its quads degenerate; they are dropped, which
// is exactly how a barrel's discs close themselves.
function rawLathe(pts, arc) {
  if (!(arc > 0) || arc > TAU + EPS)
    throw new Error(`lathe arc must be in (0, TAU], got ${arc}`);
  for (const p of pts)
    if (p.x < -EPS) throw new Error(`lathe profile crosses the axis: x=${p.x}`);

  const n = pts.length;
  const en = edgeNormals(pts);
  const vn = vertexNormals(pts, en);
  const full = arc >= TAU - EPS;
  const segs = Math.max(3, Math.round(LATHE_SEGS_FULL * (arc / TAU)));
  const s = soup();

  // theta sweeps toward -Z, so a CCW profile's -90 normal stays outward.
  const P = (r, y, t) => [r * Math.cos(t), y, -r * Math.sin(t)];
  const N = (nx, ny, t) => vNorm([nx * Math.cos(t), ny, -nx * Math.sin(t)]);

  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    if (a.x < EPS && b.x < EPS) continue; // edge lies on the axis: sweeps to nothing
    const na = vn.start[i], nb = vn.end[i];
    for (let j = 0; j < segs; j++) {
      const t0 = arc * (j / segs), t1 = arc * ((j + 1) / segs);
      const p00 = P(a.x, a.y, t0), p10 = P(a.x, a.y, t1);
      const p11 = P(b.x, b.y, t1), p01 = P(b.x, b.y, t0);
      const n00 = N(na[0], na[1], t0), n10 = N(na[0], na[1], t1);
      const n11 = N(nb[0], nb[1], t1), n01 = N(nb[0], nb[1], t0);
      tri(s, p00, p10, p11, n00, n10, n11);
      tri(s, p00, p11, p01, n00, n11, n01);
    }
  }

  if (!full) {
    // the two flat ends of the sweep: the profile itself, fanned from its centroid
    const c = centroid2(pts);
    for (const [t, flip] of [[0, false], [arc, true]]) {
      const nrm = vNorm(vCross([Math.cos(t), 0, -Math.sin(t)], [0, 1, 0]));
      const nn = flip ? vScale(nrm, -1) : nrm;
      const cc = P(c.x, c.y, t);
      for (let i = 0; i < n; i++) {
        const a = pts[i], b = pts[(i + 1) % n];
        const pa = P(a.x, a.y, t), pb = P(b.x, b.y, t);
        if (flip) tri(s, cc, pb, pa, nn, nn, nn);
        else tri(s, cc, pa, pb, nn, nn, nn);
      }
    }
  }
  return s;
}

// ---------------------------------------------------------------------------
// unit-mesh cache: one mesh per distinct set of PROPORTIONS, so instances batch
// ---------------------------------------------------------------------------

const UNITS = new Map();

function unitCached(key, make) {
  let u = UNITS.get(key);
  if (!u) UNITS.set(key, (u = unitize(make())));
  return u;
}

const r4 = (x) => Math.round(x * 1e4) / 1e4;
const outlineKey = (pts, ...rest) =>
  pts.map((p) => `${r4(p.x)},${r4(p.y)}${p.smooth ? "s" : ""}`).join(";") + "|" + rest.map(r4).join(",");

// ---------------------------------------------------------------------------
// sections
// ---------------------------------------------------------------------------
// A face's cross-section, in that face's own (u, v) frame, bbox-centred:
//   rect(w, d)   — w along u, d along v
//   disc(r)      — radius r
//   halfDisc(r)  — flat edge along u, its curved apex toward +v (so `seat`, which
//                  opposes normals and thus flips v, mates a +cap to a -cap apex
//                  to apex).

export const rect = (w, d) => ({ kind: "rect", w, d });
export const disc = (r) => ({ kind: "disc", r });
export const halfDisc = (r) => ({ kind: "halfDisc", r });

// the largest circle the section contains
export function inradius(sec) {
  switch (sec.kind) {
    case "rect": return Math.min(sec.w, sec.d) / 2;
    case "disc": return sec.r;
    case "halfDisc": return sec.r / 2;
    default: throw new Error(`unknown section kind: ${sec.kind}`);
  }
}

// half-extents along the face's u and v — what `join`'s u/v slide is a fraction of
export function halfExtents(sec) {
  switch (sec.kind) {
    case "rect": return [sec.w / 2, sec.d / 2];
    case "disc": return [sec.r, sec.r];
    case "halfDisc": return [sec.r, sec.r / 2];
    default: throw new Error(`unknown section kind: ${sec.kind}`);
  }
}

export function scaleSec(sec, k) {
  switch (sec.kind) {
    case "rect": return rect(sec.w * k, sec.d * k);
    case "disc": return disc(sec.r * k);
    case "halfDisc": return halfDisc(sec.r * k);
    default: throw new Error(`unknown section kind: ${sec.kind}`);
  }
}

// a slab of that shape, `t` thick along its own +Y: its top/bottom faces ARE the
// section, so a joint's plate is exactly the face it lands on.
export function plate(sec, t) {
  if (!(t > 0)) throw new Error(`plate thickness must be > 0, got ${t}`);
  switch (sec.kind) {
    case "rect": return box(sec.w, t, sec.d);
    case "disc": return cylinder(sec.r, t, "y");
    case "halfDisc": return halfCylinder(sec.r, t, "y", "-z");
    default: throw new Error(`unknown section kind: ${sec.kind}`);
  }
}

// ---------------------------------------------------------------------------
// faces
// ---------------------------------------------------------------------------

function face(name, pos, n, u, sec) {
  n = vNorm(n);
  // strip any u-component along n, then v = n x u guarantees u x v = n exactly
  u = vNorm(vSub(u, vScale(n, u[0] * n[0] + u[1] * n[1] + u[2] * n[2])));
  const v = vCross(n, u);
  return { name, pos, n, u, v, sec };
}

const _m4 = new THREE.Matrix4();
const _v3 = new THREE.Vector3();

// rigid transform of a frame (placements are rigid, so no normal matrix is needed)
export function transformFace(f, M) {
  const e = M.elements; // column-major
  const rot = (a) => [
    e[0] * a[0] + e[4] * a[1] + e[8] * a[2],
    e[1] * a[0] + e[5] * a[1] + e[9] * a[2],
    e[2] * a[0] + e[6] * a[1] + e[10] * a[2],
  ];
  const p = _v3.fromArray(f.pos).applyMatrix4(M).toArray();
  return face(f.name, p, rot(f.n), rot(f.u), f.sec);
}

const AXES = {
  x: [1, 0, 0], "+x": [1, 0, 0], "-x": [-1, 0, 0],
  y: [0, 1, 0], "+y": [0, 1, 0], "-y": [0, -1, 0],
  z: [0, 0, 1], "+z": [0, 0, 1], "-z": [0, 0, -1],
};
function axisVec(a) {
  if (Array.isArray(a)) return vNorm(a);
  const v = AXES[String(a).toLowerCase()];
  if (!v) throw new Error(`unknown axis: ${a}`);
  return v;
}
// name a face by the world direction it looks along
function dirName(n) {
  const ax = [Math.abs(n[0]), Math.abs(n[1]), Math.abs(n[2])];
  const k = ax[0] >= ax[1] && ax[0] >= ax[2] ? 0 : ax[1] >= ax[2] ? 1 : 2;
  return [["left", "right"], ["bottom", "top"], ["back", "front"]][k][n[k] >= 0 ? 1 : 0];
}

// ---------------------------------------------------------------------------
// handles
// ---------------------------------------------------------------------------

function makeHandle({ unit, rot, scale, id, faces, sideFace, kind, params }) {
  const M = new THREE.Matrix4();
  M.set(
    rot[0], rot[1], rot[2], 0,
    rot[3], rot[4], rot[5], 0,
    rot[6], rot[7], rot[8], 0,
    0, 0, 0, 1,
  );
  M.multiply(_m4.makeScale(scale[0], scale[1], scale[2]));

  const map = Object.create(null);
  for (const f of faces) map[f.name] = f;

  const h = {
    kind, params, unit, rot, scale, id,
    matrix: M,              // unit mesh -> this solid's own frame
    faces: map,             // named frames, in the solid's own frame
    side: sideFace || null, // barrels: a boss swung round the axis
    face(name, arg) {
      if (name && typeof name === "object" && name.n && name.pos) return name; // already a frame
      if (typeof name === "object") { arg = name.angle ?? name.arg; name = name.name; }
      if (name === "side") {
        if (!sideFace) throw new Error(`${kind} has no side face`);
        return sideFace(arg ?? 0);
      }
      const f = map[name];
      if (!f)
        throw new Error(`${kind} has no face "${name}" (has: ${Object.keys(map).join(", ")}${sideFace ? ", side(angle)" : ""})`);
      return f;
    },
    faceNames() {
      return Object.keys(map).concat(sideFace ? ["side"] : []);
    },
    mesh() {
      const m = new THREE.Mesh(geometryOf(unit));
      m.matrixAutoUpdate = false;
      m.matrix.copy(M);
      m.name = id;
      m.userData.id = id;
      return m;
    },
  };
  return h;
}

// ---------------------------------------------------------------------------
// extrude / lathe (public builders — solids in their own right)
// ---------------------------------------------------------------------------

export function extrude(outline, depth) {
  const pts = toPts(outline);
  const unit = unitCached("ext|" + outlineKey(pts, depth), () => rawExtrude(pts, depth));
  const [ex, ey, ez] = unit.ext;
  const faces = [
    face("front", [0, 0, ez / 2], [0, 0, 1], [1, 0, 0], rect(ex, ey)),
    face("back", [0, 0, -ez / 2], [0, 0, -1], [1, 0, 0], rect(ex, ey)),
  ];
  return makeHandle({
    unit, rot: [1, 0, 0, 0, 1, 0, 0, 0, 1], scale: [ex, ey, ez],
    id: `ext:${r4(ex)},${r4(ey)},${r4(ez)}:${outlineKey(pts, depth)}`,
    faces, kind: "extrude", params: { depth },
  });
}

export function lathe(outline, arc = TAU) {
  const pts = toPts(outline);
  const unit = unitCached("lth|" + outlineKey(pts, arc), () => rawLathe(pts, arc));
  const [ex, ey, ez] = unit.ext;
  // the caps are the profile's rims: their radius is the profile's reach there
  let top = -Infinity, bot = Infinity;
  for (const p of pts) { top = Math.max(top, p.y); bot = Math.min(bot, p.y); }
  let rTop = 0, rBot = 0;
  for (const p of pts) {
    if (p.y > top - 1e-6) rTop = Math.max(rTop, p.x);
    if (p.y < bot + 1e-6) rBot = Math.max(rBot, p.x);
  }
  const faces = [
    face("top", [0, ey / 2, 0], [0, 1, 0], [1, 0, 0], disc(rTop)),
    face("bottom", [0, -ey / 2, 0], [0, -1, 0], [1, 0, 0], disc(rBot)),
  ];
  return makeHandle({
    unit, rot: [1, 0, 0, 0, 1, 0, 0, 0, 1], scale: [ex, ey, ez],
    id: `lth:${r4(ex)},${r4(ey)},${r4(ez)}:${outlineKey(pts, arc)}`,
    faces, kind: "lathe", params: { arc },
  });
}

// ---------------------------------------------------------------------------
// core 1 — box(w, h, d, { slope, curve })
// ---------------------------------------------------------------------------
// The profile lives in the ZY plane (so `slope` can drop the top's +Z edge) and is
// swept along X. Unit axes: x = depth, y = height, z = width.

const ROT_BOX = m3AxisAngle(0, 1, 0, -HPI); // unit x -> world +Z, unit z -> world -X

// One attempt at the profile, with the top bent by `amp` along the chord's outward
// normal. Returns the point list plus the two top rim corners.
function boxProfileAt(slope, amp) {
  const yTop = 0.5 - slope;                          // the +Z top corner, dropped
  const A = { x: 0.5, y: yTop, smooth: false };      // +Z top corner
  const B = { x: -0.5, y: 0.5, smooth: false };      // -Z top corner
  const pts = [{ x: -0.5, y: -0.5, smooth: false }];
  // slope == 1 folds the +Z top corner onto the bottom one: the box becomes a wedge
  // and that corner is ONE point, not two coincident ones.
  if (Math.abs(yTop + 0.5) > 1e-6) pts.push({ x: 0.5, y: -0.5, smooth: false });
  pts.push(A);
  if (Math.abs(amp) > 1e-6) {
    // quadratic bend of the A->B chord along its own outward normal
    const dx = B.x - A.x, dy = B.y - A.y;
    const L = Math.hypot(dx, dy);
    const on = [dy / L, -dx / L];     // outward = direction turned -90
    const ctl = { x: (A.x + B.x) / 2 + on[0] * 2 * amp, y: (A.y + B.y) / 2 + on[1] * 2 * amp };
    for (let i = 1; i < CURVE_SAMPLES; i++) {
      const t = i / CURVE_SAMPLES, s = 1 - t;
      pts.push({
        x: s * s * A.x + 2 * s * t * ctl.x + t * t * B.x,
        y: s * s * A.y + 2 * s * t * ctl.y + t * t * B.y,
        smooth: true, // the bent top shades round; its two rims stay crisp
      });
    }
  }
  pts.push(B);
  return { pts, A, B };
}

const BEND_SHRINK = 0.75;  // how hard a too-deep concave bend is pulled back
const BEND_TRIES = 12;     // 0.75^12 ~ 0.03: a flat quad, which is always star-shaped

function boxProfile(slope, curve) {
  // A deep CONCAVE sag can fold the top past the centroid, and the caps are fanned
  // from the centroid — so the bend is pulled back (bounded loop, guaranteed to
  // terminate: at amp -> 0 the profile is a convex quad) until the outline is
  // star-shaped again. Convex bends never fold, so they never shrink.
  let amp = curve * 0.25 * Math.hypot(1, slope); // chord length = hypot(depth 1, drop)
  let out = null;
  for (let i = 0; i < BEND_TRIES; i++) {
    out = boxProfileAt(slope, amp);
    if (starMargin(out.pts) > 1e-3) break;
    amp *= BEND_SHRINK;
    if (i === BEND_TRIES - 1) out = boxProfileAt(slope, 0);
  }

  const { pts, A, B } = out;
  // re-normalise into a unit square: a convex bend would otherwise poke out of the
  // bounding box, and w/h/d must stay exact bbox dimensions.
  let lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
  for (const p of pts) {
    lo[0] = Math.min(lo[0], p.x); hi[0] = Math.max(hi[0], p.x);
    lo[1] = Math.min(lo[1], p.y); hi[1] = Math.max(hi[1], p.y);
  }
  const ex = hi[0] - lo[0], ey = hi[1] - lo[1];
  const cx = (hi[0] + lo[0]) / 2, cy = (hi[1] + lo[1]) / 2;
  for (const p of pts) { p.x = (p.x - cx) / ex; p.y = (p.y - cy) / ey; }
  return { pts, A, B }; // A and B are members of pts, so they are normalised too
}

const BOX_PROFILES = new Map();
function boxProfileCached(slope, curve) {
  const k = `${r4(slope)},${r4(curve)}`;
  let p = BOX_PROFILES.get(k);
  if (!p) BOX_PROFILES.set(k, (p = boxProfile(slope, curve)));
  return p;
}

export function box(w, h, d, opts = {}) {
  const slope = clamp(opts.slope ?? 0, 0, 1);
  const curve = clamp(opts.curve ?? 0, -1, 1);
  if (!(w > 0 && h > 0 && d > 0)) throw new Error(`box needs positive w,h,d — got ${w},${h},${d}`);

  const prof = boxProfileCached(slope, curve);
  const unit = unitCached(`box|${r4(slope)},${r4(curve)}`, () => rawExtrude(toPts(prof.pts), 1));

  // profile (x, y) -> solid (z = x*d, y = y*h); width w along X
  const A = [0, prof.A.y * h, prof.A.x * d];  // +Z top rim corner
  const B = [0, prof.B.y * h, prof.B.x * d];  // -Z top rim corner
  const chord = vSub(B, A);
  const topN = vNorm([0, -chord[2], chord[1]]); // (x, y) turned -90, mapped back
  const topPos = vScale(vAdd(A, B), 0.5);
  const topLen = vLen(chord);
  const frontH = A[1] + h / 2;  // the +Z wall, shortened by the slope
  const backH = B[1] + h / 2;

  const faces = [
    face("top", topPos, topN, [1, 0, 0], rect(w, topLen)),
    face("bottom", [0, -h / 2, 0], [0, -1, 0], [1, 0, 0], rect(w, d)),
    face("right", [w / 2, 0, 0], [1, 0, 0], [0, 1, 0], rect(h, d)),
    face("left", [-w / 2, 0, 0], [-1, 0, 0], [0, 1, 0], rect(h, d)),
    face("front", [0, (A[1] - h / 2) / 2, d / 2], [0, 0, 1], [1, 0, 0], rect(w, frontH)),
    face("back", [0, (B[1] - h / 2) / 2, -d / 2], [0, 0, -1], [1, 0, 0], rect(w, backH)),
  ];

  return makeHandle({
    unit, rot: ROT_BOX, scale: [d, h, w], // scale is in UNIT axes (x=depth, z=width)
    id: `box:${r4(w)},${r4(h)},${r4(d)},${r4(slope)},${r4(curve)}`,
    faces, kind: "box", params: { w, h, d, slope, curve },
  });
}

// ---------------------------------------------------------------------------
// core 2 — cylinder(r, h, axis)
// ---------------------------------------------------------------------------

const CYL_PROFILE = [
  { x: 0, y: -0.5, smooth: false },
  { x: 0.5, y: -0.5, smooth: false },
  { x: 0.5, y: 0.5, smooth: false },
  { x: 0, y: 0.5, smooth: false },
];

export function cylinder(r, h, axis = "y") {
  if (!(r > 0 && h > 0)) throw new Error(`cylinder needs positive r,h — got ${r},${h}`);
  const A = axisVec(axis);
  const unit = unitCached("cyl", () => rawLathe(toPts(CYL_PROFILE.map((p) => ({ ...p }))), TAU));
  const rot = alignY(A);                       // unit +Y -> the barrel's axis
  const e1 = m3v(rot, [1, 0, 0]);              // angle 0 of the side boss
  const e3 = m3v(rot, [0, 0, 1]);

  const capP = vScale(A, h / 2), capM = vScale(A, -h / 2);
  const faces = [
    face(dirName(A), capP, A, e1, disc(r)),
    face(dirName(vScale(A, -1)), capM, vScale(A, -1), e1, disc(r)),
  ];
  faces.push({ ...faces[0], name: "cap0" }, { ...faces[1], name: "cap1" });

  const sideFace = (t) => {
    const dir = vNorm(vAdd(vScale(e1, Math.cos(t)), vScale(e3, Math.sin(t))));
    return face("side", vScale(dir, r), dir, A, rect(h, 2 * r));
  };

  return makeHandle({
    unit, rot, scale: [2 * r, h, 2 * r],
    id: `cyl:${r4(r)},${r4(h)}`,
    faces, sideFace, kind: "cylinder", params: { r, h, axis },
  });
}

// row-major 3x3 times a vector
const m3v = (m, v) => [
  m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
  m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
  m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
];
const m3mul = (a, b) => {
  const o = new Array(9);
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      o[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
  return o;
};

// ---------------------------------------------------------------------------
// core 3 — halfCylinder(r, h, axis, round)
// ---------------------------------------------------------------------------
// Half a barrel: two halfDisc caps, a flat back, and a curved side. `round` is the
// direction the curved side bulges (perpendicular to the axis). The solid is still
// centred on its bounding box (2r x h x r), so the flat back sits at +r/2 from the
// origin and the apex at -r/2 — no caller does that arithmetic.

export function halfCylinder(r, h, axis = "y", round = "-z") {
  if (!(r > 0 && h > 0)) throw new Error(`halfCylinder needs positive r,h — got ${r},${h}`);
  const A = axisVec(axis);
  let Rv = axisVec(round);
  // project the bulge perpendicular to the axis
  const dp = Rv[0] * A[0] + Rv[1] * A[1] + Rv[2] * A[2];
  Rv = vSub(Rv, vScale(A, dp));
  if (vLen(Rv) < 1e-6)
    throw new Error(`halfCylinder round (${round}) is parallel to axis (${axis})`);
  Rv = vNorm(Rv);

  const unit = unitCached("hcyl", () => rawLathe(toPts(CYL_PROFILE.map((p) => ({ ...p }))), Math.PI));

  // unit frame: axis +Y, bulge -Z, flat plane +Z. Spin about the axis to aim the bulge.
  const rot0 = alignY(A);
  const b0 = m3v(rot0, [0, 0, -1]);
  const ang = Math.atan2(
    vCross(b0, Rv)[0] * A[0] + vCross(b0, Rv)[1] * A[1] + vCross(b0, Rv)[2] * A[2],
    b0[0] * Rv[0] + b0[1] * Rv[1] + b0[2] * Rv[2],
  );
  const rot = m3mul(m3AxisAngle(A[0], A[1], A[2], ang), rot0);

  const W = m3v(rot, [1, 0, 0]);              // the flat's width direction
  const flatPos = vScale(Rv, -r / 2);         // = the circle's centre
  const capP = vScale(A, h / 2), capM = vScale(A, -h / 2);

  const faces = [
    face(dirName(A), capP, A, W, halfDisc(r)),
    face(dirName(vScale(A, -1)), capM, vScale(A, -1), W, halfDisc(r)),
    face("flat", flatPos, vScale(Rv, -1), A, rect(h, 2 * r)),
  ];
  faces.push({ ...faces[0], name: "cap0" }, { ...faces[1], name: "cap1" });

  const sideFace = (t) => {
    if (Math.abs(t) > HPI + 1e-6)
      throw new Error(`halfCylinder side angle ${t} is off the curved half (|angle| <= PI/2)`);
    const dir = vNorm(vAdd(vScale(Rv, Math.cos(t)), vScale(W, Math.sin(t))));
    return face("side", vAdd(flatPos, vScale(dir, r)), dir, A, rect(h, 2 * r));
  };

  return makeHandle({
    unit, rot, scale: [2 * r, h, r],
    id: `hcyl:${r4(r)},${r4(h)}`,
    faces, sideFace, kind: "halfCylinder", params: { r, h, axis, round },
  });
}

// ---------------------------------------------------------------------------
// seat — the one placement primitive
// ---------------------------------------------------------------------------
// The rigid transform laying B flat on A: origins coincide (plus `gap` along A's
// normal), u axes align, normals OPPOSE.

export function seat(faceA, faceB, gap = 0) {
  const uA = faceA.u, vA = faceA.v, nA = faceA.n;
  const uB = faceB.u, vB = faceB.v, nB = faceB.n;
  // R maps (uB, vB, nB) -> (uA, -vA, -nA): still right-handed (two columns negated)
  const T = [uB, vB, nB];                 // rows of B's basis-inverse (orthonormal)
  const D = [uA, vScale(vA, -1), vScale(nA, -1)]; // target columns
  const R = new Array(9);
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      R[i * 3 + j] = D[0][i] * T[0][j] + D[1][i] * T[1][j] + D[2][i] * T[2][j];

  const target = vAdd(faceA.pos, vScale(nA, gap));
  const t = vSub(target, m3v(R, faceB.pos));
  const M = new THREE.Matrix4();
  M.set(
    R[0], R[1], R[2], t[0],
    R[3], R[4], R[5], t[1],
    R[6], R[7], R[8], t[2],
    0, 0, 0, 1,
  );
  return M;
}

// ---------------------------------------------------------------------------
// parts — pieces plus faces. A part never writes a coordinate.
// ---------------------------------------------------------------------------

let CUR = null;
function ctx() {
  if (!CUR) CUR = { pieces: [], anchors: [], plug: null };
  return CUR;
}

function pieceFace(p, spec, arg) {
  const f = p.handle.face(spec, arg);
  return transformFace(f, p.M);
}

// a free-standing solid
export function piece(mesh) {
  const c = ctx();
  const p = { handle: mesh, M: new THREE.Matrix4(), face: null };
  p.face = (spec, arg) => pieceFace(p, spec, arg);
  c.pieces.push(p);
  return p;
}

// seat a piece on a face of another piece
export function join(host, hostFace, mesh, meshFace, opts = {}) {
  const c = ctx();
  if (!host || !host.handle) throw new Error("join: host must be a piece()");
  const fa = pieceFace(host, hostFace, opts.hostAngle);
  const local = mesh.face(meshFace, opts.meshAngle);

  const M = seat(fa, local, opts.gap ?? 0);

  // slide across the host face, in fractions of ITS half-extents
  const du = opts.u ?? 0, dv = opts.v ?? 0;
  if (du || dv) {
    const [hu, hv] = halfExtents(fa.sec);
    const off = vAdd(vScale(fa.u, du * hu), vScale(fa.v, dv * hv));
    M.premultiply(_m4.makeTranslation(off[0], off[1], off[2]));
  }

  const p = { handle: mesh, M, face: null };
  p.face = (spec, arg) => pieceFace(p, spec, arg);

  // re-align a named side of both: the two faces' planes become one plane
  if (opts.flush) {
    const fh = pieceFace(host, opts.flush);
    const fc = p.face(opts.flush);
    const dsp = vSub(fh.pos, fc.pos);
    const k = dsp[0] * fh.n[0] + dsp[1] * fh.n[1] + dsp[2] * fh.n[2];
    const off = vScale(fh.n, k);
    p.M.premultiply(_m4.makeTranslation(off[0], off[1], off[2]));
  }

  c.pieces.push(p);
  return p;
}

// Offer a face to a child. It carries NO dimension — the child's plug sizes the joint.
//
// `opts` is `{ angle, u, v }` (a bare number/string is still read as the angle, so the
// old positional call keeps working). `u`/`v` SLIDE the offered frame across the face,
// in fractions of its half-extents — the same slide, in the same units, that `join`
// already gives a piece. Without it a face can only ever be offered at its centre, so
// two children cannot sit side by side on one face (two fingers on a palm) without the
// caller writing the offset itself, which is the one thing a part may not do. The
// section is NOT re-centred by the slide: it still describes the face, so the frame
// carries `off` — where it now sits in that section's own (u, v) — and a consumer can
// still tell whether a plug landing there is inside the face.
export function anchor(name, piece, face, opts = {}) {
  const c = ctx();
  if (!name) throw new Error("anchor needs a name");
  if (!piece || !piece.handle) throw new Error(`anchor "${name}": needs a piece()`);
  const o = opts !== null && typeof opts === "object" ? opts : { angle: opts };
  const u = o.u ?? 0, v = o.v ?? 0;
  if (!Number.isFinite(u) || !Number.isFinite(v))
    throw new Error(`anchor "${name}": u/v must be finite fractions, got ${u},${v}`);
  c.anchors.push({ name, piece, face, arg: o.angle ?? o.arg, u, v });
  return name;
}

// the face this part plugs into its parent by
export function mount(piece, face, opts = {}) {
  const c = ctx();
  if (!piece || !piece.handle) throw new Error("mount: needs a piece()");
  if (c.plug) throw new Error("mount: this part already has a mount face");
  c.plug = { piece, face, arg: opts.angle, scale: opts.scale ?? 1, round: !!opts.round };
  return c.plug;
}

// rotation (row-major) turning `n` onto +Y while leaving +Z pointing +Z (FORWARD is
// preserved; aligning the face's u instead would spin a drum-shaped part sideways).
export function rebaseRot(n) {
  n = vNorm(n);
  let c = vSub([0, 0, 1], vScale(n, n[2]));   // +Z projected off the normal
  if (vLen(c) < 1e-6) {
    const a = vNorm(vSub([1, 0, 0], vScale(n, n[0])));
    c = vCross(a, n);
  }
  c = vNorm(c);
  const a = vCross(n, c);
  return [a[0], a[1], a[2], n[0], n[1], n[2], c[0], c[1], c[2]]; // rows
}

// re-base on the mount face and hand the part over
export function finish() {
  const c = ctx();
  CUR = null;
  if (!c.pieces.length) throw new Error("finish(): the part has no pieces");

  let B = new THREE.Matrix4(); // identity: a part with no mount stays where it is
  let plugFace = null;
  if (c.plug) {
    const f = pieceFace(c.plug.piece, c.plug.face, c.plug.arg);
    const R = rebaseRot(f.n);
    const p = m3v(R, f.pos);
    B.set(
      R[0], R[1], R[2], -p[0],
      R[3], R[4], R[5], -p[1],
      R[6], R[7], R[8], -p[2],
      0, 0, 0, 1,
    );
    plugFace = transformFace(f, B);
    let sec = plugFace.sec;
    if (c.plug.round) sec = disc(inradius(sec) * c.plug.scale);
    else if (c.plug.scale !== 1) sec = scaleSec(sec, c.plug.scale);
    plugFace = { ...plugFace, name: "mount", sec };
  }

  const meshes = c.pieces.map((p) => {
    const m = p.handle.mesh();
    m.matrix.premultiply(p.M).premultiply(B);
    return m;
  });

  const anchors = Object.create(null);
  for (const a of c.anchors) {
    let f = { ...pieceFace(a.piece, a.face, a.arg), name: a.name };
    const [hu, hv] = halfExtents(f.sec);
    const off = [a.u * hu, a.v * hv];          // the slide, in the face's own (u, v)
    if (off[0] || off[1])
      f = { ...f, pos: vAdd(f.pos, vAdd(vScale(f.u, off[0]), vScale(f.v, off[1]))) };
    anchors[a.name] = { ...transformFace(f, B), off };
  }

  return {
    meshes,
    anchors,
    sec: plugFace ? plugFace.sec : null,
    plug: plugFace,
    pieces: c.pieces,
  };
}

// drop a half-built part on the floor (a demo/debug escape hatch, not part of the
// composition contract)
export function reset() { CUR = null; }
