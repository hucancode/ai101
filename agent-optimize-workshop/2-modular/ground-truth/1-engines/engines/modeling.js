// MODELING ENGINE — procedural primitives.
//
// A primitive call returns a THREE.Mesh: a shared UNIT geometry (generated once per
// distinct `key`, so instances batch) plus a local matrix carrying the real size.
// The mesh transforms left-multiply that matrix — no vertex work after generation.
// `userData.id` = shape identity incl. size (colour by it so identical pieces match
// like lego); `userData.key` = the size-free geometry identity.
//
// Shape params that survive into the KEY are RATIOS, so scaling w/h/d is pure
// instance scale (box slope, coneCut taper, cutHemisphere wall/cut, archBox depth,
// segment counts).
//
// ORIGINS: cylinder base-circle center, +Y; box center; sphere
// center; hemisphere base center, dome +Y; halfCyl base half-circle, round +Z,
// flat on XY, +Y; archBox cylinder-circle center.
import { TAU, THREE, geometryOf } from "../gfx.js";

const q4 = (v) => +(+v).toFixed(4);
const REGISTRY = new Map();          // key -> { positions: F32, normals: F32 }
const _defaultMat = new THREE.MeshPhongMaterial({ shininess: 60 });

// mesh factory: register the unit mesh on first use, return a THREE.Mesh instance
// carrying a pure-scale matrix (matrixAutoUpdate off — the mesh transforms drive
// it). `userData.id` = shape identity INCLUDING size, so a caller colours identical
// pieces alike; `userData.key` = the size-free unit-mesh identity.
function H(key, gen, sx, sy, sz) {
  if (!REGISTRY.has(key)) {
    const g = gen();
    REGISTRY.set(key, { positions: new Float32Array(g.positions), normals: new Float32Array(g.normals) });
  }
  const mesh = new THREE.Mesh(geometryOf(REGISTRY.get(key)), _defaultMat);
  mesh.matrixAutoUpdate = false;
  mesh.matrix.makeScale(sx, sy, sz);
  mesh.userData.key = key;
  mesh.userData.id = `${key}@${q4(sx)},${q4(sy)},${q4(sz)}`;
  return mesh;
}

// ---- mesh generators (unit meshes) -----------------------------------------

const geo = () => ({ positions: [], normals: [] });

function tri(g, a, b, c, n) {
  g.positions.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  if (n) g.normals.push(n[0], n[1], n[2], n[0], n[1], n[2], n[0], n[1], n[2]);
}
function triS(g, a, b, c, na, nb, nc) {
  g.positions.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  g.normals.push(na[0], na[1], na[2], nb[0], nb[1], nb[2], nc[0], nc[1], nc[2]);
}
const quad = (g, a, b, c, d, n) => { tri(g, a, b, c, n); tri(g, a, c, d, n); };
function merge(...gs) {
  const out = geo();
  for (const g of gs) { out.positions.push(...g.positions); out.normals.push(...g.normals); }
  return out;
}

// unit box (1x1x1, centered). slope = fraction of height dropped at the top's
// front (+Z) edge; curve bends the sloped top (-1 concave .. +1 convex).
function genBox(slope, curve) {
  const g = geo();
  const x = 0.5, y = 0.5, z = 0.5, d = 1;
  const s = Math.max(0, Math.min(slope, 1 - 1e-4));
  const k = Math.max(-1, Math.min(1, curve));
  const N = s > 0 && k !== 0 ? 12 : 1;
  const yAt = (u) => y - s * (u - k * u * (1 - u));
  for (let i = 0; i < N; i++) {
    const u0 = i / N, u1 = (i + 1) / N;
    const z0 = -z + d * u0, z1 = -z + d * u1;
    const y0 = yAt(u0), y1 = yAt(u1);
    const l = Math.hypot(d / N, y1 - y0);
    const nt = [0, (z1 - z0) / l, -(y1 - y0) / l];
    quad(g, [-x, y1, z1], [x, y1, z1], [x, y0, z0], [-x, y0, z0], nt);
    quad(g, [x, -y, z1], [x, -y, z0], [x, y0, z0], [x, y1, z1], [1, 0, 0]);
    quad(g, [-x, -y, z0], [-x, -y, z1], [-x, y1, z1], [-x, y0, z0], [-1, 0, 0]);
  }
  quad(g, [-x, -y, -z], [x, -y, -z], [x, -y, z], [-x, -y, z], [0, -1, 0]);
  quad(g, [-x, -y, z], [x, -y, z], [x, y - s, z], [-x, y - s, z], [0, 0, 1]);
  quad(g, [x, -y, -z], [-x, -y, -z], [-x, y, -z], [x, y, -z], [0, 0, -1]);
  return g;
}

// arc sweep of a cylinder side + caps, shared by cylinder / halfCylinder
function cylBody(r, h, seg, a0, a1, caps = true) {
  const g = geo();
  for (let i = 0; i < seg; i++) {
    const t0 = a0 + ((a1 - a0) * i) / seg, t1 = a0 + ((a1 - a0) * (i + 1)) / seg;
    const c0 = Math.cos(t0), s0 = Math.sin(t0), c1 = Math.cos(t1), s1 = Math.sin(t1);
    const p00 = [r * c0, 0, r * s0], p01 = [r * c1, 0, r * s1];
    const p10 = [r * c0, h, r * s0], p11 = [r * c1, h, r * s1];
    const n0 = [c0, 0, s0], n1 = [c1, 0, s1];
    triS(g, p00, p11, p01, n0, n1, n1);
    triS(g, p00, p10, p11, n0, n0, n1);
    if (caps) { tri(g, [0, h, 0], p11, p10, [0, 1, 0]); tri(g, [0, 0, 0], p00, p01, [0, -1, 0]); }
  }
  return g;
}

// unit truncated cone: base r=1 at y=0 to top r=q at y=1. q=0 -> true cone.
function genConeCut(q, seg) {
  const g = geo();
  const ny = 1 - q, il = 1 / Math.hypot(1, ny);
  const nrm = (c, s) => [c * il, ny * il, s * il];
  for (let i = 0; i < seg; i++) {
    const t0 = (i / seg) * TAU, t1 = ((i + 1) / seg) * TAU;
    const c0 = Math.cos(t0), s0 = Math.sin(t0), c1 = Math.cos(t1), s1 = Math.sin(t1);
    const n0 = nrm(c0, s0), n1 = nrm(c1, s1);
    const p00 = [c0, 0, s0], p01 = [c1, 0, s1];
    if (q > 1e-6) {
      const p10 = [q * c0, 1, q * s0], p11 = [q * c1, 1, q * s1];
      triS(g, p00, p11, p01, n0, n1, n1);
      triS(g, p00, p10, p11, n0, n0, n1);
      tri(g, [0, 1, 0], p11, p10, [0, 1, 0]);
    } else {
      triS(g, p00, [0, 1, 0], p01, n0, nrm((c0 + c1) / 2, (s0 + s1) / 2), n1);
    }
    tri(g, [0, 0, 0], p00, p01, [0, -1, 0]);
  }
  return g;
}

// unit sphere / hemisphere lathe: phi 0 (pole) .. phiMax; base closes the last ring
function genLathe(seg, rings, phiMax, base) {
  const g = geo();
  const pt = (u, v) => {
    const th = u * TAU, ph = v * phiMax, sp = Math.sin(ph);
    return [Math.cos(th) * sp, Math.cos(ph), Math.sin(th) * sp];
  };
  for (let j = 0; j < rings; j++)
    for (let i = 0; i < seg; i++) {
      const n00 = pt(i / seg, j / rings), n01 = pt((i + 1) / seg, j / rings);
      const n10 = pt(i / seg, (j + 1) / rings), n11 = pt((i + 1) / seg, (j + 1) / rings);
      triS(g, n00, n11, n10, n00, n11, n10);
      triS(g, n00, n01, n11, n00, n01, n11);
    }
  if (base)
    for (let i = 0; i < seg; i++) {
      const t0 = (i / seg) * TAU, t1 = ((i + 1) / seg) * TAU;
      tri(g, [0, 0, 0], [Math.cos(t0), 0, Math.sin(t0)], [Math.cos(t1), 0, Math.sin(t1)], [0, -1, 0]);
    }
  return g;
}

// unit cut hemisphere: shell r=1, wall t + cut plane = FRACTIONS of r
function genCutHemisphere(t, cut, seg, rings) {
  const g = geo();
  const ri = Math.max(0.05, 1 - t);
  const yc = Math.min(cut, ri - 1e-3);
  const band = (rad, out) => {
    const ph0 = Math.acos(Math.min(1, yc / rad));
    for (let j = 0; j < rings; j++) {
      const a = ph0 + ((Math.PI / 2 - ph0) * j) / rings;
      const b = ph0 + ((Math.PI / 2 - ph0) * (j + 1)) / rings;
      for (let i = 0; i < seg; i++) {
        const u0 = (i / seg) * TAU, u1 = ((i + 1) / seg) * TAU;
        const pt = (th, ph) => [Math.cos(th) * Math.sin(ph), Math.cos(ph), Math.sin(th) * Math.sin(ph)];
        const n00 = pt(u0, a), n01 = pt(u1, a), n10 = pt(u0, b), n11 = pt(u1, b);
        const s = (n) => [n[0] * rad, n[1] * rad, n[2] * rad];
        const f = (n) => (out ? n : [-n[0], -n[1], -n[2]]);
        if (out) {
          triS(g, s(n00), s(n11), s(n10), f(n00), f(n11), f(n10));
          triS(g, s(n00), s(n01), s(n11), f(n00), f(n01), f(n11));
        } else {
          triS(g, s(n00), s(n10), s(n11), f(n00), f(n10), f(n11));
          triS(g, s(n00), s(n11), s(n01), f(n00), f(n11), f(n01));
        }
      }
    }
  };
  band(1, true);
  band(ri, false);
  const ro = Math.sqrt(Math.max(0, 1 - yc * yc));
  const rr = Math.sqrt(Math.max(0, ri * ri - yc * yc));
  for (let i = 0; i < seg; i++) {
    const t0 = (i / seg) * TAU, t1 = ((i + 1) / seg) * TAU;
    const c0 = Math.cos(t0), s0 = Math.sin(t0), c1 = Math.cos(t1), s1 = Math.sin(t1);
    quad(g, [rr * c0, yc, rr * s0], [rr * c1, yc, rr * s1], [ro * c1, yc, ro * s1], [ro * c0, yc, ro * s0], [0, 1, 0]);
    quad(g, [ri * c1, 0, ri * s1], [ri * c0, 0, ri * s0], [c0, 0, s0], [c1, 0, s1], [0, -1, 0]);
  }
  return g;
}

// unit half cylinder: round side +Z, flat face on the XY plane, y 0..1
function genHalfCylinder(seg, flat) {
  const g = cylBody(1, 1, seg, 0, Math.PI);
  if (flat) quad(g, [-1, 0, 0], [-1, 1, 0], [1, 1, 0], [1, 0, 0], [0, 0, -1]);
  return g;
}

// unit arch box: half cylinder r=1 + a box on the -Z side reaching depth dp
function genHalfCylinderBox(dp, seg) {
  const hc = genHalfCylinder(seg, false);
  const b = geo();
  const x = 1, z0 = -dp, z1 = 0, h = 1;
  quad(b, [x, 0, z1], [x, 0, z0], [x, h, z0], [x, h, z1], [1, 0, 0]);
  quad(b, [-x, 0, z0], [-x, 0, z1], [-x, h, z1], [-x, h, z0], [-1, 0, 0]);
  quad(b, [-x, h, z1], [x, h, z1], [x, h, z0], [-x, h, z0], [0, 1, 0]);
  quad(b, [-x, 0, z0], [x, 0, z0], [x, 0, z1], [-x, 0, z1], [0, -1, 0]);
  quad(b, [x, 0, z0], [-x, 0, z0], [-x, h, z0], [x, h, z0], [0, 0, -1]);
  return merge(hc, b);
}

// ---- primitive handles -----------------------------------------------------

export function box(w = 1, h = 1, d = 1, slope = 0, curve = 0) {
  const sp = q4(Math.max(0, Math.min(slope, 0.9999))), k = q4(Math.max(-1, Math.min(1, curve)));
  return H(`box:${sp}:${k}`, () => genBox(sp, k), w, h, d);
}
export const cylinder = (r = 0.5, h = 1, seg = 24) => H(`cyl:${seg}`, () => cylBody(1, 1, seg, 0, TAU), r, h, r);
export function coneCut(r0 = 0.5, r1 = 0.25, h = 1, seg = 24) {
  const q = q4(Math.max(0, r1 / r0));
  return H(`coneCut:${q}:${seg}`, () => genConeCut(q, seg), r0, h, r0);
}
export const sphere = (r = 0.5, seg = 24, rings = 16) => H(`sph:${seg}:${rings}`, () => genLathe(seg, rings, Math.PI, false), r, r, r);
export function cutHemisphere(r = 0.5, t = 0.25, cut = 0.7, seg = 24, rings = 6) {
  const tp = q4(Math.max(0.02, Math.min(t, 0.95))), cp = q4(Math.max(0, Math.min(cut, 0.98)));
  return H(`cutHemi:${tp}:${cp}:${seg}:${rings}`, () => genCutHemisphere(tp, cp, seg, rings), r, r, r);
}
export const halfCylinder = (r = 0.5, h = 1, seg = 12) => H(`halfCyl:${seg}`, () => genHalfCylinder(seg, true), r, h, r);
export function halfCylinderBox(r = 0.5, h = 1, depth = 0.5, seg = 12) {
  const dp = q4(depth / r);
  return H(`archBox:${dp}:${seg}`, () => genHalfCylinderBox(dp, seg), r, h, r);
}
