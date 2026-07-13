// primitives.js — procedural unit meshes (triangle soups) + a mesh factory.
//
// Every shape in the scene comes from this file. A source is {id, positions, normals}
// where `id` encodes KIND + SIZE, so two pieces of the same shape at the same size
// share one id -> one cached GPU buffer AND one identity colour (see colorMemo).
//
// Nothing here touches the raw three build; THREE comes through gfx.js.

import { THREE, TAU, geometryOf, attachMesh, rotX, rotY, rotZ } from "./gfx.js";

// ---- source cache ----------------------------------------------------------

const SOURCES = new Map(); // id -> {id, positions, normals}
const q = (v) => Math.round(v * 1e4) / 1e4; // quantise dims for a stable id

function source(id, build) {
  let s = SOURCES.get(id);
  if (s) return s;
  const { P, N } = build();
  if (P.length !== N.length || P.length % 9 !== 0)
    throw new Error(`primitive ${id}: malformed soup (${P.length} pos, ${N.length} nrm)`);
  fixWinding(P, N);
  s = { id, positions: new Float32Array(P), normals: new Float32Array(N) };
  SOURCES.set(id, s);
  return s;
}

// Flip any triangle whose face normal disagrees with its vertex normals, so a
// mis-ordered quad can never become an invisible (back-facing) hole.
function fixWinding(P, N) {
  const triCount = P.length / 9; // bounded: soups are built, not streamed
  for (let t = 0; t < triCount; t++) {
    const o = t * 9;
    const ax = P[o + 3] - P[o], ay = P[o + 4] - P[o + 1], az = P[o + 5] - P[o + 2];
    const bx = P[o + 6] - P[o], by = P[o + 7] - P[o + 1], bz = P[o + 8] - P[o + 2];
    const fx = ay * bz - az * by, fy = az * bx - ax * bz, fz = ax * by - ay * bx;
    const nx = N[o] + N[o + 3] + N[o + 6];
    const ny = N[o + 1] + N[o + 4] + N[o + 7];
    const nz = N[o + 2] + N[o + 5] + N[o + 8];
    if (fx * nx + fy * ny + fz * nz >= 0) continue;
    for (let k = 0; k < 3; k++) { // swap vertices 1 and 2
      const i = o + 3 + k, j = o + 6 + k;
      let tmp = P[i]; P[i] = P[j]; P[j] = tmp;
      tmp = N[i]; N[i] = N[j]; N[j] = tmp;
    }
  }
}

// ---- soup emitters ---------------------------------------------------------

const tri = (P, N, a, b, c, na, nb, nc) => {
  P.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  N.push(na[0], na[1], na[2], nb[0], nb[1], nb[2], nc[0], nc[1], nc[2]);
};
const quad = (P, N, a, b, c, d, na, nb, nc, nd) => {
  tri(P, N, a, b, c, na, nb, nc);
  tri(P, N, a, c, d, na, nc, nd);
};
const unit = (x, y, z) => { const l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; };

// ---- box -------------------------------------------------------------------

export function box(w, h, d) {
  return source(`box:${q(w)}:${q(h)}:${q(d)}`, () => {
    const P = [], N = [];
    const x = w / 2, y = h / 2, z = d / 2;
    const faces = [
      { n: [1, 0, 0], v: [[x, -y, -z], [x, -y, z], [x, y, z], [x, y, -z]] },
      { n: [-1, 0, 0], v: [[-x, -y, z], [-x, -y, -z], [-x, y, -z], [-x, y, z]] },
      { n: [0, 1, 0], v: [[-x, y, z], [x, y, z], [x, y, -z], [-x, y, -z]] },
      { n: [0, -1, 0], v: [[-x, -y, -z], [x, -y, -z], [x, -y, z], [-x, -y, z]] },
      { n: [0, 0, 1], v: [[-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]] },
      { n: [0, 0, -1], v: [[x, -y, -z], [-x, -y, -z], [-x, y, -z], [x, y, -z]] },
    ];
    for (const f of faces) quad(P, N, f.v[0], f.v[1], f.v[2], f.v[3], f.n, f.n, f.n, f.n);
    return { P, N };
  });
}

// ---- cylinder / cone / tapered cylinder (axis = +Y, centred) ---------------
// r0 = bottom radius, r1 = top radius. r1 = 0 -> cone. caps = false -> open shell.

export function cylinder(r0, r1, h, seg = 20, caps = true) {
  return source(`cyl:${q(r0)}:${q(r1)}:${q(h)}:${seg}:${caps ? 1 : 0}`, () => {
    const P = [], N = [];
    const y0 = -h / 2, y1 = h / 2, dr = r1 - r0;
    const top = [0, 1, 0], bot = [0, -1, 0];
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      const n0 = unit(c0 * h, -dr, s0 * h), n1 = unit(c1 * h, -dr, s1 * h);
      const b0 = [c0 * r0, y0, s0 * r0], b1 = [c1 * r0, y0, s1 * r0];
      const t0 = [c0 * r1, y1, s0 * r1], t1 = [c1 * r1, y1, s1 * r1];
      tri(P, N, b0, t0, t1, n0, n0, n1);
      tri(P, N, b0, t1, b1, n0, n1, n1);
      if (!caps) continue;
      if (r1 > 1e-6) tri(P, N, [0, y1, 0], t1, t0, top, top, top);
      if (r0 > 1e-6) tri(P, N, [0, y0, 0], b0, b1, bot, bot, bot);
    }
    return { P, N };
  });
}

export const cone = (r, h, seg = 20) => cylinder(r, 0, h, seg);

// ---- sphere / hemisphere (axis = +Y, centred on its own centre) ------------

function dome(P, N, r, seg, rings, lat0, lat1) {
  for (let j = 0; j < rings; j++) {
    const p0 = lat0 + ((lat1 - lat0) * j) / rings;
    const p1 = lat0 + ((lat1 - lat0) * (j + 1)) / rings;
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
      const v = (p, a) => [Math.sin(p) * Math.cos(a), Math.cos(p), Math.sin(p) * Math.sin(a)];
      const na = v(p0, a0), nb = v(p0, a1), nc = v(p1, a1), nd = v(p1, a0);
      const s = (n) => [n[0] * r, n[1] * r, n[2] * r];
      quad(P, N, s(na), s(nb), s(nc), s(nd), na, nb, nc, nd);
    }
  }
}

export function sphere(r, seg = 20, rings = 12) {
  return source(`sph:${q(r)}:${seg}:${rings}`, () => {
    const P = [], N = [];
    dome(P, N, r, seg, rings, 0, Math.PI);
    return { P, N };
  });
}

// up = true  -> dome above y=0 with a flat disc at y=0 facing -Y
// up = false -> bowl below y=0 with a flat disc at y=0 facing +Y  (a socket cup)
export function hemisphere(r, up = true, seg = 20, rings = 6) {
  return source(`hemi:${q(r)}:${up ? 1 : 0}:${seg}:${rings}`, () => {
    const P = [], N = [];
    if (up) dome(P, N, r, seg, rings, 0, Math.PI / 2);
    else dome(P, N, r, seg, rings, Math.PI / 2, Math.PI);
    const cn = up ? [0, -1, 0] : [0, 1, 0];
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
      tri(P, N, [0, 0, 0], [Math.cos(a0) * r, 0, Math.sin(a0) * r],
        [Math.cos(a1) * r, 0, Math.sin(a1) * r], cn, cn, cn);
    }
    return { P, N };
  });
}

// ---- half cylinder (axis = +Y, flat face on the z=0 plane, dome toward +Z) --

export function halfCylinder(r, h, seg = 14) {
  return source(`half:${q(r)}:${q(h)}:${seg}`, () => {
    const P = [], N = [];
    const y0 = -h / 2, y1 = h / 2;
    const flat = [0, 0, -1], top = [0, 1, 0], bot = [0, -1, 0];
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI, a1 = ((i + 1) / seg) * Math.PI;
      // angle measured from +X toward +Z so the shell lives in z >= 0
      const p = (a, y) => [Math.cos(a) * r, y, Math.sin(a) * r];
      const n0 = [Math.cos(a0), 0, Math.sin(a0)], n1 = [Math.cos(a1), 0, Math.sin(a1)];
      quad(P, N, p(a0, y0), p(a1, y0), p(a1, y1), p(a0, y1), n0, n1, n1, n0);
      tri(P, N, [0, y1, 0], p(a0, y1), p(a1, y1), top, top, top);
      tri(P, N, [0, y0, 0], p(a1, y0), p(a0, y0), bot, bot, bot);
    }
    quad(P, N, [-r, y0, 0], [r, y0, 0], [r, y1, 0], [-r, y1, 0], flat, flat, flat, flat);
    return { P, N };
  });
}

// ---- mesh factory ----------------------------------------------------------
// `piece` = build the mesh, rotate it in place, hang it on a node at `at`, and
// colour it by its SHAPE ID (identity colouring: same shape+size -> same colour).

export function piece(node, src, col, { at = [0, 0, 0], rx = 0, ry = 0, rz = 0 } = {}) {
  const m = new THREE.Mesh(geometryOf(src));
  m.matrixAutoUpdate = false;
  if (rx) rotX(m, rx);
  if (ry) rotY(m, ry);
  if (rz) rotZ(m, rz);
  return attachMesh(node, m, col(src.id), at);
}
