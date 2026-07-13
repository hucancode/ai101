// Primitive mesh generators + builder layer for the mech workshop.
// Raw triangle soup: every generator computes positions and normals by hand,
// no mesh library. Two normal disciplines: flat face (shared face normal) and
// curved surface (per-vertex analytic normal).
import { TAU, lerp, clamp, m3Mul, m3MulV, m3Rot, vAdd } from "./math.js";
import { makeColorer } from "./color.js";

// ---- soup helpers -----------------------------------------------------

function emptySoup() {
  return { positions: [], normals: [] };
}

function pushTri(soup, p0, p1, p2, n0, n1, n2) {
  soup.positions.push(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], p2[0], p2[1], p2[2]);
  soup.normals.push(n0[0], n0[1], n0[2], n1[0], n1[1], n1[2], n2[0], n2[1], n2[2]);
}

function faceNormal(p0, p1, p2) {
  const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2];
  const vx = p2[0] - p0[0], vy = p2[1] - p0[1], vz = p2[2] - p0[2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz) || 1;
  return [nx / len, ny / len, nz / len];
}

// flat face: triangle shares one computed face normal (crisp edge)
function flatTri(soup, p0, p1, p2) {
  const n = faceNormal(p0, p1, p2);
  pushTri(soup, p0, p1, p2, n, n, n);
}

// curved surface: per-vertex normals supplied by caller (smooth shading)
function smoothTri(soup, p0, p1, p2, n0, n1, n2) {
  pushTri(soup, p0, p1, p2, n0, n1, n2);
}

// flat quad p0,p1,p2,p3 (CCW), single shared face normal from first triangle
function flatQuad(soup, p0, p1, p2, p3) {
  flatTri(soup, p0, p1, p2);
  flatTri(soup, p0, p2, p3);
}

// curved quad p0,p1,p2,p3 (CCW) with per-vertex normals n0..n3
function smoothQuad(soup, p0, p1, p2, p3, n0, n1, n2, n3) {
  smoothTri(soup, p0, p1, p2, n0, n1, n2);
  smoothTri(soup, p0, p2, p3, n0, n2, n3);
}

function merge(...soups) {
  const out = emptySoup();
  for (const s of soups) {
    for (const v of s.positions) out.positions.push(v);
    for (const v of s.normals) out.normals.push(v);
  }
  return out;
}

function translateSoup(soup, x, y, z) {
  for (let i = 0; i < soup.positions.length; i += 3) {
    soup.positions[i] += x;
    soup.positions[i + 1] += y;
    soup.positions[i + 2] += z;
  }
  return soup;
}

function finalize(soup) {
  return { positions: new Float32Array(soup.positions), normals: new Float32Array(soup.normals) };
}

// ---- box ----------------------------------------------------------------
// Unit proportions, centered on origin. `slope` = fraction of height dropped
// at the top face's front (+Z) edge; `curve` bends that ramp (-1 concave ..
// +1 convex). The ramp is a ruled surface (straight along X, curved along Z),
// so its analytic normal degenerates correctly to flat when curve = slope = 0.
const BOX_RAMP_SEG = 8;

function genBox(w = 1, h = 1, d = 1, slope = 0, curve = 0) {
  const soup = emptySoup();
  const hw = w / 2, hh = h / 2, hd = d / 2;
  const bulgeAmp = 0.35 * h;
  const pts = [];
  for (let i = 0; i <= BOX_RAMP_SEG; i++) {
    const t = i / BOX_RAMP_SEG;
    const z = lerp(-hd, hd, t);
    const y = hh - slope * h * t + curve * bulgeAmp * Math.sin(Math.PI * t);
    const dzdt = d;
    const dydt = -slope * h + curve * bulgeAmp * Math.PI * Math.cos(Math.PI * t);
    let ny = dzdt, nz = -dydt;
    const len = Math.hypot(ny, nz) || 1;
    // clamp: an extreme slope+concave-curve combination can otherwise dip
    // the ramp below the box's own bottom face (self-intersecting solid)
    pts.push({ y: Math.max(y, -hh + 1e-4), z, ny: ny / len, nz: nz / len });
  }
  const yFront = pts[BOX_RAMP_SEG].y;

  // top ramp: ruled along X, curved along Z, smooth per-vertex normals
  for (let i = 0; i < BOX_RAMP_SEG; i++) {
    const a = pts[i], b = pts[i + 1];
    const pA0 = [-hw, a.y, a.z], pA1 = [hw, a.y, a.z];
    const pB0 = [-hw, b.y, b.z], pB1 = [hw, b.y, b.z];
    const nA = [0, a.ny, a.nz], nB = [0, b.ny, b.nz];
    smoothQuad(soup, pA0, pB0, pB1, pA1, nA, nB, nB, nA);
  }
  // bottom, back wall, front wall: flat faces
  flatQuad(soup, [-hw, -hh, -hd], [hw, -hh, -hd], [hw, -hh, hd], [-hw, -hh, hd]);
  flatQuad(soup, [-hw, -hh, -hd], [-hw, hh, -hd], [hw, hh, -hd], [hw, -hh, -hd]);
  flatQuad(soup, [-hw, -hh, hd], [hw, -hh, hd], [hw, yFront, hd], [-hw, yFront, hd]);

  // side walls: coplanar at x = ±hw. Ruled strip between the flat bottom
  // (y=-hh) and the ramp curve, z-monotone by construction so it triangulates
  // correctly even when the ramp dips non-convexly (no star-shape needed,
  // unlike a naive centroid fan).
  for (let i = 0; i < BOX_RAMP_SEG; i++) {
    const a = pts[i], b = pts[i + 1];
    flatQuad(soup, [-hw, -hh, a.z], [-hw, -hh, b.z], [-hw, b.y, b.z], [-hw, a.y, a.z]);
    flatQuad(soup, [hw, -hh, b.z], [hw, -hh, a.z], [hw, a.y, a.z], [hw, b.y, b.z]);
  }

  return finalize(soup);
}

// ---- cylinder (also backs halfCylinder via a swept angle range) --------
// Origin = base circle center, body spans y 0..h, axis +Y. Radial per-vertex
// normals on the wall (curved surface); fan caps top/bottom (flat).
function cylinderSoup(r, h, seg, a0 = 0, a1 = TAU) {
  const soup = emptySoup();
  const rim = [];
  for (let i = 0; i <= seg; i++) {
    const a = lerp(a0, a1, i / seg);
    rim.push([Math.cos(a), Math.sin(a)]);
  }
  for (let i = 0; i < seg; i++) {
    const [c0, s0] = rim[i], [c1, s1] = rim[i + 1];
    const b0 = [r * c0, 0, r * s0], t0 = [r * c0, h, r * s0];
    const b1 = [r * c1, 0, r * s1], t1 = [r * c1, h, r * s1];
    const n0 = [c0, 0, s0], n1 = [c1, 0, s1];
    smoothQuad(soup, b0, t0, t1, b1, n0, n0, n1, n1);
  }
  const cB = [0, 0, 0], cT = [0, h, 0];
  for (let i = 0; i < seg; i++) {
    const [c0, s0] = rim[i], [c1, s1] = rim[i + 1];
    flatTri(soup, cB, [r * c0, 0, r * s0], [r * c1, 0, r * s1]);
    flatTri(soup, cT, [r * c1, h, r * s1], [r * c0, h, r * s0]);
  }
  const isFull = Math.abs(Math.abs(a1 - a0) - TAU) < 1e-5;
  if (!isFull) {
    const [c0, s0] = rim[0], [c1, s1] = rim[seg];
    // end cap at a0: axis-bottom, axis-top, rim-top, rim-bottom
    flatQuad(soup, [0, 0, 0], [0, h, 0], [r * c0, h, r * s0], [r * c0, 0, r * s0]);
    // end cap at a1: axis-bottom, rim-bottom, rim-top, axis-top
    flatQuad(soup, [0, 0, 0], [r * c1, 0, r * s1], [r * c1, h, r * s1], [0, h, 0]);
  }
  return finalize(soup);
}

function genCylinder(r = 1, h = 1, seg = 16) {
  return cylinderSoup(r, h, seg, 0, TAU);
}

function genHalfCylinder(r = 1, h = 1, seg = 16) {
  return cylinderSoup(r, h, seg, 0, Math.PI);
}

// ---- truncated cone -------------------------------------------------------
// base radius r0 at y=0, top radius r1 at y=h. Flank normal tilts with the
// slope (never purely radial): normal(a) ∝ (h cos a, -(r1-r0), h sin a).
function genConeCut(r0 = 1, r1 = 0.5, h = 1, seg = 16) {
  const soup = emptySoup();
  const dr = r1 - r0;
  const rim = [];
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * TAU;
    rim.push([Math.cos(a), Math.sin(a)]);
  }
  for (let i = 0; i < seg; i++) {
    const [c0, s0] = rim[i], [c1, s1] = rim[i + 1];
    const b0 = [r0 * c0, 0, r0 * s0], t0 = [r1 * c0, h, r1 * s0];
    const b1 = [r0 * c1, 0, r0 * s1], t1 = [r1 * c1, h, r1 * s1];
    const nn0 = [h * c0, -dr, h * s0], nn1 = [h * c1, -dr, h * s1];
    const l0 = Math.hypot(...nn0) || 1, l1 = Math.hypot(...nn1) || 1;
    const n0 = [nn0[0] / l0, nn0[1] / l0, nn0[2] / l0];
    const n1 = [nn1[0] / l1, nn1[1] / l1, nn1[2] / l1];
    smoothQuad(soup, b0, t0, t1, b1, n0, n0, n1, n1);
  }
  const cB = [0, 0, 0], cT = [0, h, 0];
  for (let i = 0; i < seg; i++) {
    const [c0, s0] = rim[i], [c1, s1] = rim[i + 1];
    flatTri(soup, cB, [r0 * c0, 0, r0 * s0], [r0 * c1, 0, r0 * s1]);
    flatTri(soup, cT, [r1 * c1, h, r1 * s1], [r1 * c0, h, r1 * s0]);
  }
  return finalize(soup);
}

// ---- shared lathe dome (sphere / hemisphere / cut-hemisphere) -------------
// Polar angle phi swept from phi0..phi1 (0 = +Y pole), longitude theta 0..TAU.
// On a unit sphere position IS normal; `inward` flips winding+normal for a
// cavity surface (viewed from inside, e.g. the socket of a cut hemisphere).
function latheDome(soup, r, seg, rings, phi0, phi1, inward = false) {
  const grid = [];
  for (let j = 0; j <= rings; j++) {
    const phi = lerp(phi0, phi1, j / rings);
    const row = [];
    for (let i = 0; i <= seg; i++) {
      const theta = (i / seg) * TAU;
      row.push([Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta)]);
    }
    grid.push(row);
  }
  const pt = (n) => [r * n[0], r * n[1], r * n[2]];
  const flip = (n) => [-n[0], -n[1], -n[2]];
  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < seg; i++) {
      const nA = grid[j][i], nB = grid[j][i + 1], nC = grid[j + 1][i + 1], nD = grid[j + 1][i];
      const pA = pt(nA), pB = pt(nB), pC = pt(nC), pD = pt(nD);
      if (inward) {
        smoothQuad(soup, pA, pD, pC, pB, flip(nA), flip(nD), flip(nC), flip(nB));
      } else {
        smoothQuad(soup, pA, pB, pC, pD, nA, nB, nC, nD);
      }
    }
  }
  return grid;
}

function flatDisc(soup, r, y, seg, down) {
  const cB = [0, y, 0];
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
    const p0 = [r * Math.cos(a0), y, r * Math.sin(a0)];
    const p1 = [r * Math.cos(a1), y, r * Math.sin(a1)];
    if (down) flatTri(soup, cB, p0, p1);
    else flatTri(soup, cB, p1, p0);
  }
}

// ---- sphere / hemisphere ---------------------------------------------------
function genSphere(r = 1, seg = 16, rings = 12) {
  const soup = emptySoup();
  latheDome(soup, r, seg, rings, 0, Math.PI, false);
  return finalize(soup);
}

function genHemisphere(r = 1, seg = 16, rings = 8) {
  const dome = emptySoup();
  latheDome(dome, r, seg, rings, 0, Math.PI / 2, false);
  const base = emptySoup();
  flatDisc(base, r, 0, seg, true); // base closed by downward disc
  return finalize(merge(dome, base));
}

// flat annulus (ring), always built at y=0 then shifted into place by the
// caller via translateSoup — `up` picks the winding that faces +Y (lip ring)
// vs -Y (base ring).
function flatAnnulus(soup, rOuter, rInner, seg, up) {
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
    const O0 = [rOuter * Math.cos(a0), 0, rOuter * Math.sin(a0)];
    const O1 = [rOuter * Math.cos(a1), 0, rOuter * Math.sin(a1)];
    const I0 = [rInner * Math.cos(a0), 0, rInner * Math.sin(a0)];
    const I1 = [rInner * Math.cos(a1), 0, rInner * Math.sin(a1)];
    if (up) { flatTri(soup, O0, I0, I1); flatTri(soup, O0, I1, O1); }
    else { flatTri(soup, O0, I1, I0); flatTri(soup, O0, O1, I1); }
  }
}

// ---- cut hemisphere: socket shell -----------------------------------------
// Outer dome + inner cavity (offset by wall thickness t·r), sliced by one
// horizontal plane at y = cut·r. Lip ring closes the shell's cross-section at
// the cut (the socket opening is the hole inside the inner rim); base ring
// closes it at y=0.
function genCutHemisphere(r = 1, t = 0.15, cut = 0.6, seg = 16, rings = 8) {
  const tw = clamp(t, 0.02, 0.9);
  const ri = r * (1 - tw);
  const cutC = clamp(cut, 0.02, Math.min(0.98, (1 - tw) * 0.98));
  const cutY = cutC * r;
  const phiCutOuter = Math.acos(clamp(cutY / r, -1, 1));
  const phiCutInner = Math.acos(clamp(cutY / ri, -1, 1));

  const outer = emptySoup();
  latheDome(outer, r, seg, rings, phiCutOuter, Math.PI / 2, false);
  const inner = emptySoup();
  latheDome(inner, ri, seg, rings, phiCutInner, Math.PI / 2, true);

  // lip ring built flat at y=0, then shifted in place to the cut height
  const rOuterAtCut = r * Math.sin(phiCutOuter);
  const rInnerAtCut = ri * Math.sin(phiCutInner);
  const lip = emptySoup();
  flatAnnulus(lip, rOuterAtCut, rInnerAtCut, seg, true);
  translateSoup(lip, 0, cutY, 0);

  const base = emptySoup();
  flatAnnulus(base, r, ri, seg, false);

  return finalize(merge(outer, inner, lip, base));
}

// ---- arch box (half cylinder capping a box) --------------------------------
// D-shaped cross-section (box of height h topped by a radius-r semicircular
// dome) extruded along Z by `depth`. A D-plate on its side.
function genHalfCylinderBox(r = 1, h = 1, depth = 1, seg = 16) {
  const soup = emptySoup();
  const dd = depth;
  const arc = [];
  for (let i = 0; i <= seg; i++) {
    const b = (i / seg) * Math.PI;
    arc.push([Math.cos(b), Math.sin(b)]);
  }
  // dome: curved, ruled straight along Z
  for (let i = 0; i < seg; i++) {
    const [c0, s0] = arc[i], [c1, s1] = arc[i + 1];
    const b0 = [r * c0, h + r * s0, 0], b1 = [r * c1, h + r * s1, 0];
    const f0 = [r * c0, h + r * s0, dd], f1 = [r * c1, h + r * s1, dd];
    const n0 = [c0, s0, 0], n1 = [c1, s1, 0];
    smoothQuad(soup, b0, b1, f1, f0, n0, n1, n1, n0);
  }
  // straight walls + floor: flat faces
  flatQuad(soup, [r, 0, 0], [r, h, 0], [r, h, dd], [r, 0, dd]);
  flatQuad(soup, [-r, 0, 0], [-r, 0, dd], [-r, h, dd], [-r, h, 0]);
  flatQuad(soup, [-r, 0, 0], [r, 0, 0], [r, 0, dd], [-r, 0, dd]);
  // D-shaped end caps (convex: box corners + dome arc), fan from one corner
  const boundary2D = [[-r, 0], [r, 0]];
  for (const [c, s] of arc) boundary2D.push([r * c, h + r * s]);
  const front = boundary2D.map(([x, y]) => [x, y, dd]);
  const back = boundary2D.map(([x, y]) => [x, y, 0]);
  for (let i = 1; i < front.length - 1; i++) flatTri(soup, front[0], front[i], front[i + 1]);
  for (let i = 1; i < back.length - 1; i++) flatTri(soup, back[0], back[i + 1], back[i]);
  return finalize(soup);
}

// ==========================================================================
// Builder layer — handles, registry, key/id, transform algebra.
// Mesh generated at unit proportions; real size lives in the starting scale
// matrix. Quantize every param before it enters a key or an id, else float
// noise (e.g. from a slider) would split an identical shape into two keys.
// ==========================================================================

const Q = 1e-4;
const q = (x) => Math.round(x / Q) * Q;
const qi = (x) => Math.round(x);

const registry = new Map(); // key -> mesh, one unit mesh generated per key

export function meshOf(key) {
  return registry.get(key);
}

function register(key, genFn) {
  let m = registry.get(key);
  if (!m) { m = genFn(); registry.set(key, m); }
  return m;
}

function keyOf(name, ...shapeParts) {
  return `${name}:${shapeParts.map(q).join(",")}`;
}

function scaleM(sx, sy, sz) {
  return [sx, 0, 0, 0, sy, 0, 0, 0, sz];
}

// ---- catalog: 8 builders ---------------------------------------------------
// Every param has a sensible default; bare box() etc. work.

export function box(w = 1, h = 1, d = 1, slope = 0, curve = 0) {
  const qs = q(slope), qc = q(curve);
  const key = keyOf("box", qs, qc);
  const mesh = register(key, () => genBox(1, 1, 1, qs, qc));
  const qw = q(w), qh = q(h), qd = q(d);
  return { key, id: `${key}|${qw},${qh},${qd}`, mesh, m: scaleM(qw, qh, qd), t: [0, 0, 0] };
}

export function cylinder(r = 0.5, h = 1, seg = 16) {
  const qseg = qi(seg);
  const key = keyOf("cylinder", qseg);
  const mesh = register(key, () => genCylinder(1, 1, qseg));
  const qr = q(r), qh = q(h);
  return { key, id: `${key}|${qr},${qh}`, mesh, m: scaleM(qr, qh, qr), t: [0, 0, 0] };
}

export function coneCut(r0 = 0.5, r1 = 0.25, h = 1, seg = 16) {
  const qseg = qi(seg);
  const taper = q(r0 !== 0 ? r1 / r0 : 0);
  const key = keyOf("coneCut", taper, qseg);
  const mesh = register(key, () => genConeCut(1, taper, 1, qseg));
  const qr0 = q(r0), qh = q(h);
  return { key, id: `${key}|${qr0},${qh}`, mesh, m: scaleM(qr0, qh, qr0), t: [0, 0, 0] };
}

export function sphere(r = 0.5, seg = 16, rings = 12) {
  const qseg = qi(seg), qrings = qi(rings);
  const key = keyOf("sphere", qseg, qrings);
  const mesh = register(key, () => genSphere(1, qseg, qrings));
  const qr = q(r);
  return { key, id: `${key}|${qr}`, mesh, m: scaleM(qr, qr, qr), t: [0, 0, 0] };
}

export function hemisphere(r = 0.5, seg = 16, rings = 8) {
  const qseg = qi(seg), qrings = qi(rings);
  const key = keyOf("hemisphere", qseg, qrings);
  const mesh = register(key, () => genHemisphere(1, qseg, qrings));
  const qr = q(r);
  return { key, id: `${key}|${qr}`, mesh, m: scaleM(qr, qr, qr), t: [0, 0, 0] };
}

export function cutHemisphere(r = 0.5, t = 0.15, cut = 0.6, seg = 16, rings = 8) {
  const qt = q(t), qcut = q(cut), qseg = qi(seg), qrings = qi(rings);
  const key = keyOf("cutHemisphere", qt, qcut, qseg, qrings);
  const mesh = register(key, () => genCutHemisphere(1, qt, qcut, qseg, qrings));
  const qr = q(r);
  return { key, id: `${key}|${qr}`, mesh, m: scaleM(qr, qr, qr), t: [0, 0, 0] };
}

// ---- transform algebra: chainable, matrix composition only, never vertex work

// translate along the handle's *current* local axes (so a chain of
// rotate-then-translate reads like turtle-graphics "turn, then step forward")
export function translate(h, x, y, z) {
  const delta = m3MulV(h.m, [x, y, z]);
  return { ...h, t: vAdd(h.t, delta) };
}

function rotAxis(h, axis, angle) {
  // post-multiply: rotates the local frame, so it — and any translate that
  // follows in the chain — turns rigidly about the handle's current origin
  return { ...h, m: m3Mul(h.m, m3Rot(axis, angle)) };
}
export const rotX = (h, angle) => rotAxis(h, "x", angle);
export const rotY = (h, angle) => rotAxis(h, "y", angle);
export const rotZ = (h, angle) => rotAxis(h, "z", angle);

export function bake(h) {
  return { key: h.key, id: h.id, mesh: h.mesh, m: h.m.slice(), t: h.t.slice() };
}

// ---- collect: run a builder fn, bake+color everything it emits, gather
// the unit meshes referenced (one per key) for GPU upload.
export function collect(builderFn, seed, params, pose) {
  const raw = builderFn(params);
  const list = Array.isArray(raw) ? raw : [raw];
  const colorOf = makeColorer(seed);
  const items = [];
  const meshByKey = new Map();
  for (let h of list) {
    if (pose) h = pose(h);
    const item = bake(h);
    item.color = colorOf(item.id);
    items.push(item);
    if (!meshByKey.has(item.key)) meshByKey.set(item.key, item.mesh);
  }
  return { items, meshes: [...meshByKey.values()] };
}

export function halfCylinder(r = 0.5, h = 1, seg = 16) {
  const qseg = qi(seg);
  const key = keyOf("halfCylinder", qseg);
  const mesh = register(key, () => genHalfCylinder(1, 1, qseg));
  const qr = q(r), qh = q(h);
  return { key, id: `${key}|${qr},${qh}`, mesh, m: scaleM(qr, qh, qr), t: [0, 0, 0] };
}

export function halfCylinderBox(r = 0.5, h = 0.6, depth = 1, seg = 16) {
  const qseg = qi(seg);
  const hRatio = q(r !== 0 ? h / r : 0);
  const depthRatio = q(r !== 0 ? depth / r : 0);
  const key = keyOf("halfCylinderBox", hRatio, depthRatio, qseg);
  const mesh = register(key, () => genHalfCylinderBox(1, hRatio, depthRatio, qseg));
  const qr = q(r);
  return { key, id: `${key}|${qr}`, mesh, m: scaleM(qr, qr, qr), t: [0, 0, 0] };
}
