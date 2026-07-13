// STUB — NOT the modeling engine, and deliberately not in engines/.
//
// A minimal stand-in implementing only the slice of the modeling CONTRACT that
// engines/joint.js consumes (extrude, lathe, cylinder, plate, inradius + the section
// constructors), so check-joint.mjs can run while engines/modeling.js is still being
// written by another agent. check-joint.mjs redirects the import here ONLY when the real
// engines/modeling.js is absent.

import { THREE } from "./gfx.js";

const px = (p) => (Array.isArray(p) ? p[0] : p.x);
const py = (p) => (Array.isArray(p) ? p[1] : p.y);

// flat-shaded triangle soup; degenerate (zero-area) triangles are dropped, never emitted
function mesh(tris) {
  const pos = [], nrm = [];
  for (const [a, b, c] of tris) {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const l = Math.hypot(n[0], n[1], n[2]);
    if (l < 1e-12) continue;                         // no area: contributes nothing
    for (const p of [a, b, c]) {
      pos.push(p[0], p[1], p[2]);
      nrm.push(n[0] / l, n[1] / l, n[2] / l);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(nrm), 3));
  g.computeBoundingBox();
  const m = new THREE.Mesh(g);
  m.matrixAutoUpdate = false;
  // every solid is centred on its own bounding box
  const c = g.boundingBox.getCenter(new THREE.Vector3());
  m.matrix.makeTranslation(-c.x, -c.y, -c.z);
  return m;
}

export function extrude(outline, depth) {
  const n = outline.length, h = depth / 2, tris = [];
  let cx = 0, cy = 0;
  for (const p of outline) { cx += px(p) / n; cy += py(p) / n; }
  for (let i = 0; i < n; i++) {
    const a = outline[i], b = outline[(i + 1) % n];
    const A = [px(a), py(a)], B = [px(b), py(b)];
    tris.push([[A[0], A[1], -h], [B[0], B[1], -h], [B[0], B[1], h]]);   // side
    tris.push([[A[0], A[1], -h], [B[0], B[1], h], [A[0], A[1], h]]);
    tris.push([[cx, cy, h], [A[0], A[1], h], [B[0], B[1], h]]);         // +Z cap
    tris.push([[cx, cy, -h], [B[0], B[1], -h], [A[0], A[1], -h]]);      // −Z cap
  }
  return mesh(tris);
}

export function lathe(outline, arc = Math.PI * 2, seg = 32) {
  const n = outline.length, tris = [];
  const full = Math.abs(arc - Math.PI * 2) < 1e-9;
  const at = (p, t) => [px(p) * Math.cos(t), py(p), -px(p) * Math.sin(t)];
  for (let s = 0; s < seg; s++) {
    const t0 = (arc * s) / seg, t1 = (arc * (s + 1)) / seg;
    for (let i = 0; i < n; i++) {
      const a = outline[i], b = outline[(i + 1) % n];
      if (!full && i === n - 1) break;
      const A0 = at(a, t0), B0 = at(b, t0), A1 = at(a, t1), B1 = at(b, t1);
      tris.push([A0, B0, B1]);
      tris.push([A0, B1, A1]);
    }
  }
  return mesh(tris);
}

export function box(w, h, d) {
  const x = w / 2, y = h / 2, z = d / 2, tris = [];
  const q = (a, b, c, e) => { tris.push([a, b, c]); tris.push([a, c, e]); };
  q([-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]);
  q([x, -y, -z], [-x, -y, -z], [-x, y, -z], [x, y, -z]);
  q([-x, -y, -z], [-x, -y, z], [-x, y, z], [-x, y, -z]);
  q([x, -y, z], [x, -y, -z], [x, y, -z], [x, y, z]);
  q([-x, y, z], [x, y, z], [x, y, -z], [-x, y, -z]);
  q([-x, -y, -z], [x, -y, -z], [x, -y, z], [-x, -y, z]);
  return mesh(tris);
}

export function cylinder(r, h, axis = "y") {
  const o = [[0, -h / 2], [r, -h / 2], [r, h / 2], [0, h / 2]];
  const m = lathe(o.map(([a, b]) => ({ x: a, y: b })), Math.PI * 2);
  if (axis === "x") m.matrix.premultiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2));
  if (axis === "z") m.matrix.premultiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
  return m;
}

export function halfCylinder(r, h) { return cylinder(r, h); }   // not used by joint.js

// --- sections ---------------------------------------------------------------

export const rect = (w, d) => ({ kind: "rect", w, d });
export const disc = (r) => ({ kind: "disc", r });
export const halfDisc = (r) => ({ kind: "halfDisc", r });

export function inradius(sec) {
  if (sec.kind === "rect") return Math.min(sec.w, sec.d) / 2;
  if (sec.kind === "disc") return sec.r;
  if (sec.kind === "halfDisc") return sec.r / 2;
  throw new Error(`stub-modeling: unknown section ${JSON.stringify(sec)}`);
}

// the section as a closed CCW outline in its own plane (u along x, v along y)
function outlineOf(sec, seg = 32) {
  if (sec.kind === "rect") {
    const w = sec.w / 2, d = sec.d / 2;
    return [{ x: -w, y: -d }, { x: w, y: -d }, { x: w, y: d }, { x: -w, y: d }];
  }
  const o = [];
  if (sec.kind === "disc") {
    for (let i = 0; i < seg; i++) {
      const a = (Math.PI * 2 * i) / seg;
      o.push({ x: sec.r * Math.cos(a), y: sec.r * Math.sin(a), smooth: true });
    }
    return o;
  }
  if (sec.kind === "halfDisc") {
    for (let i = 0; i <= seg; i++) {
      const a = (Math.PI * i) / seg;               // flat side along x, bulging +y
      o.push({ x: sec.r * Math.cos(a), y: sec.r * Math.sin(a), smooth: i > 0 && i < seg });
    }
    return o;
  }
  throw new Error(`stub-modeling: unknown section ${JSON.stringify(sec)}`);
}

// a slab of that shape: the section in XZ, thickness `t` along Y
export function plate(sec, t) {
  const m = extrude(outlineOf(sec), t);
  m.matrix.premultiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
  return m;
}
