// MODELING ENGINE — two builders, three cores, and faces you compose by.
//
// EVERY solid is one closed 2-D outline swept: `extrudeX` pushes a (z,y) polygon
// along X; `lathe` revolves an (r,y) profile around Y. A closed outline swept is a
// closed solid — caps included, both rims closed — so watertight-with-outward-
// normals is STRUCTURAL, not a rule to remember. Winding is repaired at generation
// (a triangle whose winding disagrees with its own outward normal is flipped), so
// an inside-out mesh is not expressible.
//
// Outline convention: CCW in its plane (+r/+z right, +y up); an edge's outward
// normal is its direction turned -90°. Outlines must be star-shaped about their
// centroid (caps are fanned from it). A point flagged `true` shades smooth.
//
// A primitive returns a MESH HANDLE: a shared unit mesh (generated once per `key`,
// so instances batch) x a rigid transform T x a scale S. `userData.id` = shape
// identity incl. size (colour by it and identical pieces match like lego);
// `userData.key` = the size-free unit-mesh identity.
//
// ORIGIN: every primitive is centred on its own bounding box — ONE origin rule, so
// no caller ever does half-height arithmetic. Composition is by FACE: `faceOf`
// hands back a face's frame plus its SECTION (the cross-section you would see
// cutting there), `join` seats one piece's face flat on another's, and the joint
// engine sizes its hardware from those same sections.
import { TAU, THREE, geometryOf, vAdd, vScale, vNorm, vCross } from "../gfx.js";

const q4 = (v) => +(+v).toFixed(4);
const REGISTRY = new Map();                    // key -> { positions, normals }
const _defaultMat = new THREE.MeshPhongMaterial({ shininess: 60 });

// how much of a barrel's side a boss may claim (the pad a joint plants on it)
export const SIDE_PAD = 0.45;

// ---- the two builders ------------------------------------------------------

const geo = () => ({ positions: [], normals: [] });

// push one triangle, REPAIRING the winding: if its geometric normal disagrees with
// the outward normal we intend, two corners swap. Inside-out faces cannot survive.
function tri(g, a, b, c, na, nb, nc) {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const gn = vCross(u, v);
  const m = [na[0] + nb[0] + nc[0], na[1] + nb[1] + nc[1], na[2] + nb[2] + nc[2]];
  if (gn[0] * m[0] + gn[1] * m[1] + gn[2] * m[2] < 0) { [b, c] = [c, b]; [nb, nc] = [nc, nb]; }
  g.positions.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  g.normals.push(na[0], na[1], na[2], nb[0], nb[1], nb[2], nc[0], nc[1], nc[2]);
}
const quad = (g, a, b, c, d, na, nb, nc, nd) => {
  tri(g, a, b, c, na, nb, nc);
  tri(g, a, c, d, na, nc, nd);
};

// outward normal of every edge of a closed outline
const edgeNormals = (o) => o.map((p, i) => {
  const n = o[(i + 1) % o.length];
  const d = [n[0] - p[0], n[1] - p[1]];
  const l = Math.hypot(d[0], d[1]) || 1;
  return [d[1] / l, -d[0] / l];
});
// normal at point i while drawing edge e — a smooth point averages its two edges,
// so arcs shade round and rims stay crisp
function pointNormal(o, E, i, e) {
  if (!o[i][2]) return E[e];
  const a = E[(i - 1 + o.length) % o.length], b = E[i];
  const l = Math.hypot(a[0] + b[0], a[1] + b[1]) || 1;
  return [(a[0] + b[0]) / l, (a[1] + b[1]) / l];
}
// fan a cut plane from the outline's centroid
function fan(g, o, to3, n) {
  const c = o.reduce((s, p) => [s[0] + p[0] / o.length, s[1] + p[1] / o.length], [0, 0]);
  for (let i = 0; i < o.length; i++)
    tri(g, to3(c), to3(o[i]), to3(o[(i + 1) % o.length]), n, n, n);
}

// revolve an (r, y) outline around +Y over the arc [a0, a1]
export function lathe(outline, { seg = 24, a0 = 0, a1 = TAU } = {}) {
  const g = geo(), E = edgeNormals(outline);
  const full = Math.abs(a1 - a0 - TAU) < 1e-9;
  const P = (p, t) => [p[0] * Math.cos(t), p[1], p[0] * Math.sin(t)];
  const N = (n, t) => [n[0] * Math.cos(t), n[1], n[0] * Math.sin(t)];
  for (let i = 0; i < outline.length; i++) {
    const j = (i + 1) % outline.length;
    const p = outline[i], q = outline[j];
    if (Math.abs(p[0]) < 1e-9 && Math.abs(q[0]) < 1e-9) continue;      // edge lies on the axis
    const np = pointNormal(outline, E, i, i), nq = pointNormal(outline, E, j, i);
    for (let k = 0; k < seg; k++) {
      const t0 = a0 + ((a1 - a0) * k) / seg, t1 = a0 + ((a1 - a0) * (k + 1)) / seg;
      quad(g, P(p, t0), P(q, t0), P(q, t1), P(p, t1), N(np, t0), N(nq, t0), N(nq, t1), N(np, t1));
    }
  }
  if (!full)                                                            // the two cut planes
    for (const [t, s] of [[a0, -1], [a1, 1]])
      fan(g, outline, (p) => P(p, t), vScale([Math.sin(t), 0, -Math.cos(t)], -s));
  return g;
}

// push a (z, y) polygon along X, from -depth/2 to +depth/2
export function extrudeX(outline, depth) {
  const g = geo(), E = edgeNormals(outline), h = depth / 2;
  const P = (p, x) => [x, p[1], p[0]];
  const N = (n) => [0, n[1], n[0]];
  for (let i = 0; i < outline.length; i++) {
    const j = (i + 1) % outline.length;
    const p = outline[i], q = outline[j];
    const np = pointNormal(outline, E, i, i), nq = pointNormal(outline, E, j, i);
    quad(g, P(p, -h), P(q, -h), P(q, h), P(p, h), N(np), N(nq), N(nq), N(np));
  }
  for (const [x, n] of [[-h, [-1, 0, 0]], [h, [1, 0, 0]]])
    fan(g, outline, (p) => P(p, x), n);
  return g;
}

// ---- handles ---------------------------------------------------------------

export function handle(key, gen, s, shape) {
  if (!REGISTRY.has(key)) {
    const u = gen();
    REGISTRY.set(key, {
      positions: new Float32Array(u.positions),
      normals: new Float32Array(u.normals),
    });
  }
  const mesh = new THREE.Mesh(geometryOf(REGISTRY.get(key)), _defaultMat);
  mesh.matrixAutoUpdate = false;
  const S = new THREE.Matrix4().makeScale(s[0], s[1], s[2]);
  mesh.matrix.copy(S);
  mesh.userData = { key, id: `${key}@${q4(s[0])},${q4(s[1])},${q4(s[2])}`, shape, S, T: new THREE.Matrix4() };
  return mesh;
}
// seat a handle at a rigid transform in part space
export function place(mesh, T) {
  mesh.userData.T.copy(T);
  mesh.matrix.copy(T).multiply(mesh.userData.S);
  return mesh;
}

// bake an axis rotation into a UNIT mesh, so a handle's own matrix stays pure scale
// and same-oriented instances still batch
function orient(u, e0, e1, e2) {
  const map = (v) => [
    e0[0] * v[0] + e1[0] * v[1] + e2[0] * v[2],
    e0[1] * v[0] + e1[1] * v[1] + e2[1] * v[2],
    e0[2] * v[0] + e1[2] * v[1] + e2[2] * v[2],
  ];
  const out = geo();
  for (let i = 0; i < u.positions.length; i += 3) {
    out.positions.push(...map([u.positions[i], u.positions[i + 1], u.positions[i + 2]]));
    out.normals.push(...map([u.normals[i], u.normals[i + 1], u.normals[i + 2]]));
  }
  return out;
}

const AX = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
const NEG = (v) => vScale(v, -1);
const DIR = { "+x": AX.x, "-x": NEG(AX.x), "+y": AX.y, "-y": NEG(AX.y), "+z": AX.z, "-z": NEG(AX.z) };
// world-axis scale of a barrel whose length runs along e1
const axisScale = (e1, r, h) => [0, 1, 2].map((k) => (Math.abs(e1[k]) > 0.5 ? h : r));
const BARREL = [[0, -0.5], [1, -0.5], [1, 0.5], [0, 0.5]];   // the unit (r,y) barrel outline

// ---- cores -----------------------------------------------------------------
// The three solids every part is made of.

// box — `slope` = fraction of the height dropped at ONE of the top's Z edges: +Z when
// positive, -Z when negative. (Signed, so a heel can taper backwards without the part
// rotating a solid to face the other way — a rotated box takes its faces with it.)
// `curve` bends that sloped top (-1 concave .. +1 convex).
export function box(w = 1, h = 1, d = 1, { slope = 0, curve = 0 } = {}) {
  const s = q4(Math.max(-0.99, Math.min(slope, 0.99)));
  const k = q4(Math.max(-1, Math.min(1, curve)));
  const gen = () => {
    const a = Math.abs(s);
    const o = [[-0.5, -0.5], [0.5, -0.5]];                   // bottom, -z -> +z
    const N = a > 0 && k !== 0 ? 12 : 1;
    for (let i = 0; i <= N; i++) {                           // top, +z -> -z
      const u = 1 - i / N;
      const t = s < 0 ? 1 - u : u;                           // which edge falls away
      o.push([-0.5 + u, 0.5 - a * (t - k * t * (1 - t)), N > 1 && i > 0 && i < N]);
    }
    return extrudeX(o, 1);
  };
  return handle(`box:${s}:${k}`, gen, [w, h, d], { kind: "box", w, h, d });
}

// cylinder — `axis` is the barrel axis (y default; z for a face-forward drum)
export function cylinder(r = 0.5, h = 1, { axis = "y", seg = 24 } = {}) {
  const e1 = AX[axis], e0 = axis === "y" ? AX.x : AX.y, e2 = vCross(e0, e1);
  return handle(`cyl:${axis}:${seg}`, () => orient(lathe(BARREL, { seg }), e0, e1, e2),
    axisScale(e1, r, h), { kind: "cyl", r, h, axis });
}

// halfCylinder — `axis` = the barrel axis, `round` = which way the curved side
// bulges (perpendicular to the axis). The flat face is the opposite side.
export function halfCylinder(r = 0.5, h = 1, { axis = "y", round = "+z", seg = 16 } = {}) {
  const e1 = AX[axis], e2 = DIR[round], e0 = vCross(e1, e2);
  return handle(`half:${axis}:${round}:${seg}`,
    () => orient(lathe(BARREL, { seg, a0: 0, a1: Math.PI }), e0, e1, e2),
    axisScale(e1, r, h), { kind: "half", r, h, axis, round });
}

// sphere — the joint engine's ball
export function sphere(r = 0.5, { seg = 20, rings = 12 } = {}) {
  const gen = () => lathe(
    Array.from({ length: rings + 1 }, (_, i) => {
      const ph = (i / rings) * Math.PI;
      return [Math.sin(ph), -Math.cos(ph), i > 0 && i < rings];
    }), { seg });
  return handle(`sph:${seg}:${rings}`, gen, [r, r, r], { kind: "sph", r });
}

// SOCKET — the ball cup, and the whole reason the old engine needed a paragraph of
// prose. It is ONE closed profile: out along the skirt rim, up the outer dome, in
// across the top hole rim, back down the inner dome. Revolved, that IS a double-
// walled cup with both cut edges capped and every normal outward — by construction,
// not by care. Unit outer radius 1; `wall` and `hole` are fractions of the inner
// radius (the ball's seat), so the two halves of a ball joint can never mismatch.
export function socket(rOut = 0.5, { wall = 0.28, hole = 0.55, seg = 28, rings = 8 } = {}) {
  const w = q4(wall), ho = q4(hole);
  const gen = () => {
    const ri = 1 / (1 + w), rh = ho * ri;
    const yh = Math.sqrt(Math.max(1e-6, ri * ri - rh * rh));   // the hole's plane
    const tMax = Math.asin(Math.min(1, yh));                   // where the outer dome is cut
    const o = [[ri, 0], [1, 0]];                               // skirt rim (-Y face)
    for (let i = 0; i <= rings; i++) {                         // outer dome, up to the cut
      const t = (tMax * i) / rings;
      o.push([Math.cos(t), Math.sin(t), i > 0]);
    }
    o.push([rh, yh]);                                          // hole rim (+Y face)
    for (let i = rings; i >= 0; i--) {                         // inner dome, back down
      const t = (Math.asin(Math.min(1, yh / ri)) * i) / rings;
      o.push([ri * Math.cos(t), ri * Math.sin(t), i < rings]);
    }
    return lathe(o, { seg });
  };
  return handle(`socket:${w}:${ho}:${seg}:${rings}`, gen, [rOut, rOut, rOut],
    { kind: "socket", r: rOut, wall: w, hole: ho });
}

// ---- sections --------------------------------------------------------------
// A section is a face's cross-section. It is the ONLY size a joint is ever given:
// a joint's base plate IS this shape, so its hardware can be neither fatter nor
// thinner than the limb it lands on.

export const rect = (w, d) => ({ kind: "rect", w, d });
export const disc = (r) => ({ kind: "disc", r });
export const halfDisc = (r) => ({ kind: "half", r });

// the largest circle a section contains — the one scalar every joint is built from
export function inradius(sec) {
  if (sec.kind === "rect") return Math.min(sec.w, sec.d) / 2;
  if (sec.kind === "half") return sec.r / 2;
  return sec.r;
}
export const spanU = (sec) => (sec.kind === "rect" ? sec.w : 2 * inradius(sec));
export const spanV = (sec) => (sec.kind === "rect" ? sec.d : 2 * inradius(sec));

// a slab with this section, thickness along +Y, centred on the origin
export function plate(sec, t) {
  if (sec.kind === "rect") return box(sec.w, t, sec.d);
  if (sec.kind === "half") return halfCylinder(sec.r, t, { axis: "y", round: "+z" });
  return cylinder(sec.r, t, { axis: "y" });
}
// a part's plug is a fraction of the face it grows out of
export const scaleSec = (sec, k, round = false) =>
  (round || sec.kind !== "rect" ? disc(inradius(sec) * k) : rect(sec.w * k, sec.d * k));

// ---- faces -----------------------------------------------------------------
// A face is a frame on a piece — { pos, n, u, v, sec } in PART space, u x v = n.
// A caller NAMES a face; it never writes a position or a normal, so a frame cannot
// drift from the geometry that owns it.

const xf = (T, v, dir = false) => {
  const e = T.elements;
  const r = [
    e[0] * v[0] + e[4] * v[1] + e[8] * v[2],
    e[1] * v[0] + e[5] * v[1] + e[9] * v[2],
    e[2] * v[0] + e[6] * v[1] + e[10] * v[2],
  ];
  return dir ? r : [r[0] + e[12], r[1] + e[13], r[2] + e[14]];
};
const CAPS = { y: ["top", "bottom"], z: ["front", "back"], x: ["right", "left"] };

function localFace(shape, name, { a = 0, v = 0 } = {}) {
  if (shape.kind === "box") {
    const { w, h, d } = shape;
    const F = {
      top: [AX.y, AX.x, [0, h / 2, 0], rect(w, d)],
      bottom: [NEG(AX.y), AX.x, [0, -h / 2, 0], rect(w, d)],
      left: [NEG(AX.x), AX.y, [-w / 2, 0, 0], rect(h, d)],
      right: [AX.x, AX.y, [w / 2, 0, 0], rect(h, d)],
      front: [AX.z, AX.x, [0, 0, d / 2], rect(w, h)],
      back: [NEG(AX.z), AX.x, [0, 0, -d / 2], rect(w, h)],
    }[name];
    if (!F) throw Error(`box has no face "${name}"`);
    return { n: F[0], u: F[1], pos: F[2], sec: F[3], slide: true };
  }
  if (shape.kind === "cyl" || shape.kind === "half") {
    const { r, h } = shape;
    const round = shape.kind === "half";
    // the SAME basis the generator used, or a face frame would not match its solid
    const e1 = AX[shape.axis];
    const e0 = round ? vCross(e1, DIR[shape.round]) : (shape.axis === "y" ? AX.x : AX.y);
    const e2 = round ? DIR[shape.round] : vCross(e0, e1);
    const caps = CAPS[shape.axis];
    const sec = round ? halfDisc(r) : disc(r);
    if (name === caps[0]) return { n: e1, u: e0, pos: vScale(e1, h / 2), sec, slide: !round };
    if (name === caps[1]) return { n: NEG(e1), u: e0, pos: vScale(e1, -h / 2), sec, slide: !round };
    if (round && name === "flat")
      return { n: NEG(e2), u: e1, pos: [0, 0, 0], sec: rect(h, 2 * r), slide: true };
    if (name === "side" || name === "round") {                    // a boss on the barrel
      const t = (a * Math.PI) / 180;
      const n = round ? e2 : vAdd(vScale(e0, Math.cos(t)), vScale(e2, Math.sin(t)));
      return {
        n, u: e1, pos: vAdd(vScale(n, r), vScale(e1, (v * h) / 2)),
        sec: disc(SIDE_PAD * Math.min(r, h / 2)), slide: false,
      };
    }
    throw Error(`${shape.kind} has no face "${name}"`);
  }
  throw Error(`no faces on ${shape.kind}`);
}

// face of a PLACED piece, in part space. `u`/`v` slide the frame over a flat face
// in fractions of its half-extents; `a`/`v` swing a boss around a barrel.
export function faceOf(mesh, name, opts = {}) {
  const f = localFace(mesh.userData.shape, name, opts);
  const vv = vCross(f.n, f.u);
  let pos = f.pos;
  if (f.slide)
    pos = vAdd(pos, vAdd(
      vScale(f.u, ((opts.u ?? 0) * spanU(f.sec)) / 2),
      vScale(vv, ((opts.v ?? 0) * spanV(f.sec)) / 2),
    ));
  const T = mesh.userData.T;
  return {
    pos: xf(T, pos), n: vNorm(xf(T, f.n, true)),
    u: vNorm(xf(T, f.u, true)), v: vNorm(xf(T, vv, true)), sec: f.sec,
  };
}

// the rigid transform that seats face B flat on face A: origins coincide, u axes
// align, normals OPPOSE. Every seating in the whole system — piece onto piece,
// part onto parent, hardware onto bone — is this one function.
export function seat(A, B, gap = 0) {
  const basis = (n, u) => {
    const v = vCross(n, u);
    return new THREE.Matrix4().set(
      u[0], v[0], n[0], 0,
      u[1], v[1], n[1], 0,
      u[2], v[2], n[2], 0,
      0, 0, 0, 1,
    );
  };
  const R = basis(vScale(A.n, -1), A.u).multiply(basis(B.n, B.u).invert());
  const p = vAdd(A.pos, vScale(A.n, gap));
  const moved = xf(R, B.pos, true);
  return new THREE.Matrix4()
    .makeTranslation(p[0] - moved[0], p[1] - moved[1], p[2] - moved[2])
    .multiply(R);
}

// ---- parts -----------------------------------------------------------------
// A part is PIECES joined face-to-face plus named ANCHORS (faces it offers a child)
// and one MOUNT (the face it plugs into its parent by). A part never writes a
// coordinate: a piece is placed against a face, and an anchor IS a face.
// `finish` re-bases the part so its origin = the mount face centre, mount normal =
// +Y, body hanging -Y — the frame every joint assumes.

// re-basing keeps FORWARD: the rotation that takes the mount face's normal onto +Y
// while leaving the part's own +Z pointing +Z. (Aligning the face's u instead would
// spin a part about its mount — a drum mounted underneath would end up facing
// sideways, which is not something a part author should have to think about.)
function rebase(F) {
  const Y = vNorm(F.n);
  let Z = vAdd(FWD, vScale(Y, -(FWD[0] * Y[0] + FWD[1] * Y[1] + FWD[2] * Y[2])));
  if (Math.hypot(...Z) < 1e-6) Z = vCross(Y, [1, 0, 0]);
  Z = vNorm(Z);
  const X = vCross(Y, Z);
  const M = new THREE.Matrix4().set(
    X[0], Y[0], Z[0], F.pos[0],
    X[1], Y[1], Z[1], F.pos[1],
    X[2], Y[2], Z[2], F.pos[2],
    0, 0, 0, 1,
  );
  return M.invert();
}
const FWD = [0, 0, 1];

export function createPart() {
  const pieces = [];
  const anchors = {};
  let mount = null;

  return {
    // add a free-standing piece (the first is the core)
    piece(mesh) { pieces.push(mesh); return mesh; },

    // seat `mesh`'s face `bFace` flat on `host`'s face `hFace`. `gap` pushes it out
    // along the host normal; `flush` then re-aligns a named side of both (a sole
    // stays one plane).
    join(host, hFace, mesh, bFace, opts = {}) {
      const A = faceOf(host, hFace, opts);
      place(mesh, seat(A, faceOf(mesh, bFace), opts.gap ?? 0));
      if (opts.flush) {
        const fa = faceOf(host, opts.flush), fb = faceOf(mesh, opts.flush);
        const d = fa.n.reduce((s, c, i) => s + c * (fa.pos[i] - fb.pos[i]), 0);
        place(mesh, new THREE.Matrix4()
          .makeTranslation(fa.n[0] * d, fa.n[1] * d, fa.n[2] * d)
          .multiply(mesh.userData.T));
      }
      pieces.push(mesh);
      return mesh;
    },

    // offer a face to a child. The CHILD's plug decides the joint's size, so an
    // anchor carries no dimension at all.
    anchor(name, piece, face, opts = {}) { anchors[name] = { piece, face, opts }; },

    // the face this part plugs into its parent by. `scale` shrinks the plug (a torso
    // does not hang off the full width of its chest); `round` makes it a disc.
    mount(piece, face, { scale = 1, round = false, ...opts } = {}) {
      mount = { piece, face, opts, scale, round };
    },

    finish() {
      let root = null;
      if (mount) {
        const F = faceOf(mount.piece, mount.face, mount.opts);
        const M = rebase(F);                            // mount face -> origin, its normal -> +Y
        for (const p of pieces) place(p, M.clone().multiply(p.userData.T.clone()));
        root = scaleSec(F.sec, mount.scale, mount.round);
      }
      const out = {};
      for (const [k, a] of Object.entries(anchors)) out[k] = faceOf(a.piece, a.face, a.opts);
      return { meshes: pieces, anchors: out, root };
    },
  };
}
