// modeling engine — procedural primitives.
//
// Each call returns ONE mesh handle (a THREE.Mesh). Shape is fixed by RATIOS
// (proportions + segment counts); size is a pure scale applied to the handle's
// matrix — no vertex work after the call. Two handles of the same proportions
// (any size) share one cached unit mesh, so `geometryOf` hands them the same GPU
// buffer and they batch. Every handle carries a stable string IDENTITY =
// proportions + size on `mesh.name` / `mesh.userData.id`, so equal identity →
// equal handle and a consumer colours identical pieces alike.
//
// CONTRACT: every mesh is a CLOSED surface with OUTWARD normals. Every face is
// wound so its geometric (winding) normal points OUT of the solid, and the
// stored per-vertex normals agree with that winding. Triangle soup, non-indexed
// (position + normal only), which is exactly what `geometryOf` uploads.

import { THREE, geometryOf, TAU, HPI } from "../gfx.js";

const PI = Math.PI;

// ---- small helpers ---------------------------------------------------------

const r4 = (x) => Math.round(x * 1e4) / 1e4;                       // key rounding
const vscale = (d, s) => [d[0] * s, d[1] * s, d[2] * s];
const vneg = (d) => [-d[0], -d[1], -d[2]];

function faceNormal(a, b, c) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const l = Math.hypot(nx, ny, nz) || 1;
  return [nx / l, ny / l, nz / l];
}

// A triangle-soup accumulator whose emit helpers GUARANTEE the outward-normal
// contract: flat faces are auto-wound to face a supplied outward hint (and store
// that geometric normal); smooth faces are auto-wound so the winding agrees with
// the supplied per-vertex normals. Winding-order mistakes are impossible.
function Builder() {
  const pos = [], nor = [];
  const push = (a, b, c, na, nb, nc) => {
    pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    nor.push(na[0], na[1], na[2], nb[0], nb[1], nb[2], nc[0], nc[1], nc[2]);
  };
  const api = {
    // flat triangle; `out` = intended outward direction. Winding flipped to match.
    triFlat(a, b, c, out) {
      let n = faceNormal(a, b, c);
      if (n[0] * out[0] + n[1] * out[1] + n[2] * out[2] < 0) {
        const t = b; b = c; c = t; n = faceNormal(a, b, c);
      }
      push(a, b, c, n, n, n);
    },
    quadFlat(a, b, c, d, out) { this.triFlat(a, b, c, out); this.triFlat(a, c, d, out); },
    // smooth triangle; winding flipped so it agrees with the average of na,nb,nc.
    triSmooth(a, b, c, na, nb, nc) {
      const g = faceNormal(a, b, c);
      const ax = na[0] + nb[0] + nc[0], ay = na[1] + nb[1] + nc[1], az = na[2] + nb[2] + nc[2];
      if (g[0] * ax + g[1] * ay + g[2] * az < 0) push(a, c, b, na, nc, nb);
      else push(a, b, c, na, nb, nc);
    },
    quadSmooth(a, b, c, d, na, nb, nc, nd) {
      this.triSmooth(a, b, c, na, nb, nc); this.triSmooth(a, c, d, na, nc, nd);
    },
    src() { return { positions: new Float32Array(pos), normals: new Float32Array(nor) }; },
  };
  return api;
}

// ---- unit-mesh cache + handle factory --------------------------------------
// UNIT maps a ratio signature -> one src object. geometryOf caches GPU geometry
// per src object, so same ratio => same src => same buffer => batched draw.

const UNIT = new Map();

function handle(ratioKey, build, scale, identity) {
  let src = UNIT.get(ratioKey);
  if (!src) UNIT.set(ratioKey, (src = build()));
  const mesh = new THREE.Mesh(geometryOf(src));
  mesh.matrixAutoUpdate = false;             // transforms mutate mesh.matrix directly
  mesh.matrix.makeScale(scale[0], scale[1], scale[2]);
  mesh.matrixWorldNeedsUpdate = true;
  mesh.name = identity;
  mesh.userData.id = identity;
  return mesh;
}

const need = (cond, msg) => { if (!cond) throw new Error("modeling: " + msg); };

// ============================================================================
// unit-mesh builders (all at ratio scale; size applied later by the handle)
// ============================================================================

// box — unit cube centred at origin, ±0.5. `slope` drops the top +Z edge by a
// fraction of height; `curve` bows that sloped top (−1 concave .. +1 convex).
function buildBox(slope, curve) {
  const b = Builder();
  const N = curve !== 0 ? 16 : 1;                 // subdivide the top only when bowed
  const zc = (i) => -0.5 + i / N;
  const topY = (i) => { const u = i / N; return 0.5 - slope * u + curve * 0.25 * (1 - (2 * u - 1) ** 2); };
  const fh = topY(N);
  b.quadFlat([-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [-0.5, -0.5, 0.5], [0, -1, 0]); // bottom
  b.quadFlat([-0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5], [0.5, -0.5, -0.5], [0, 0, -1]); // back +Y full
  b.quadFlat([-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, fh, 0.5], [-0.5, fh, 0.5], [0, 0, 1]);        // front (dropped)
  for (let i = 0; i < N; i++) {
    const z0 = zc(i), z1 = zc(i + 1), t0 = topY(i), t1 = topY(i + 1);
    b.quadFlat([-0.5, t0, z0], [0.5, t0, z0], [0.5, t1, z1], [-0.5, t1, z1], [0, 1, 0]);   // top strip
    b.quadFlat([-0.5, -0.5, z0], [-0.5, -0.5, z1], [-0.5, t1, z1], [-0.5, t0, z0], [-1, 0, 0]); // left
    b.quadFlat([0.5, -0.5, z0], [0.5, t0, z0], [0.5, t1, z1], [0.5, -0.5, z1], [1, 0, 0]);       // right
  }
  return b.src();
}

// cylinder — unit radius 1, base circle at y=0, grows +Y to y=1.
function buildCylinder(seg) {
  const b = Builder();
  for (let j = 0; j < seg; j++) {
    const t0 = (j / seg) * TAU, t1 = ((j + 1) / seg) * TAU;
    const d0 = [Math.cos(t0), 0, Math.sin(t0)], d1 = [Math.cos(t1), 0, Math.sin(t1)];
    b.quadSmooth([d0[0], 0, d0[2]], [d1[0], 0, d1[2]], [d1[0], 1, d1[2]], [d0[0], 1, d0[2]], d0, d1, d1, d0);
    b.triFlat([0, 0, 0], [d0[0], 0, d0[2]], [d1[0], 0, d1[2]], [0, -1, 0]);   // bottom cap
    b.triFlat([0, 1, 0], [d0[0], 1, d0[2]], [d1[0], 1, d1[2]], [0, 1, 0]);    // top cap
  }
  return b.src();
}

// coneCut — base radius 1 at y=0, top radius `taper` at y=1, +Y. taper=0 → cone.
function buildConeCut(taper, seg) {
  const b = Builder();
  const apex = taper < 1e-6;
  for (let j = 0; j < seg; j++) {
    const t0 = (j / seg) * TAU, t1 = ((j + 1) / seg) * TAU;
    const c0 = [Math.cos(t0), Math.sin(t0)], c1 = [Math.cos(t1), Math.sin(t1)];
    // side normal: radial horizontally, tilted by (1-taper) vertically over unit height
    const nrm = (c) => { const n = [c[0], 1 - taper, c[1]]; const l = Math.hypot(n[0], n[1], n[2]); return [n[0] / l, n[1] / l, n[2] / l]; };
    const n0 = nrm(c0), n1 = nrm(c1);
    if (apex) {
      b.triSmooth([c0[0], 0, c0[1]], [c1[0], 0, c1[1]], [0, 1, 0], n0, n1, [(n0[0] + n1[0]) / 2, n0[1], (n0[2] + n1[2]) / 2]);
    } else {
      b.quadSmooth([c0[0], 0, c0[1]], [c1[0], 0, c1[1]], [taper * c1[0], 1, taper * c1[1]], [taper * c0[0], 1, taper * c0[1]], n0, n1, n1, n0);
      b.triFlat([0, 1, 0], [taper * c0[0], 1, taper * c0[1]], [taper * c1[0], 1, taper * c1[1]], [0, 1, 0]); // top cap
    }
    b.triFlat([0, 0, 0], [c0[0], 0, c0[1]], [c1[0], 0, c1[1]], [0, -1, 0]);   // base cap
  }
  return b.src();
}

// sphere — unit radius 1, centred at origin. seg = longitudes, rings = latitudes.
function buildSphere(seg, rings) {
  const b = Builder();
  const at = (i, j) => {
    const phi = (i / rings) * PI, th = (j / seg) * TAU;
    return [Math.sin(phi) * Math.cos(th), Math.cos(phi), Math.sin(phi) * Math.sin(th)];
  };
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < seg; j++) {
      const a = at(i, j), bb = at(i, j + 1), c = at(i + 1, j + 1), d = at(i + 1, j);
      if (i === 0) b.triSmooth(a, c, d, a, c, d);                 // north pole fan
      else if (i === rings - 1) b.triSmooth(a, bb, d, a, bb, d);  // south pole fan
      else b.quadSmooth(a, bb, c, d, a, bb, c, d);
    }
  }
  return b.src();
}

// cutDome — the ball SOCKET. Upper half of a sphere (radius 1) with its top pole
// sliced into a round hole. Double-walled: outer shell (normals out) + inner
// shell radius (1-wall) facing the cavity (normals in), the top hole edge and the
// bottom skirt edge each closed by a ring. `wall`,`cut` are fractions of r; the
// hole radius = cut, so the cut cone sits at φ = asin(cut) from +Y.
function buildCutDome(wall, cut, seg, rings) {
  const b = Builder();
  const ri = 1 - wall;
  const phiT = Math.asin(cut);       // top hole
  const phiB = HPI;                  // equator / base rim
  const dir = (phi, th) => [Math.sin(phi) * Math.cos(th), Math.cos(phi), Math.sin(phi) * Math.sin(th)];
  for (let i = 0; i < rings; i++) {
    const p0 = phiT + (phiB - phiT) * (i / rings), p1 = phiT + (phiB - phiT) * ((i + 1) / rings);
    for (let j = 0; j < seg; j++) {
      const t0 = (j / seg) * TAU, t1 = ((j + 1) / seg) * TAU;
      const d00 = dir(p0, t0), d01 = dir(p0, t1), d10 = dir(p1, t0), d11 = dir(p1, t1);
      // outer shell: position = unit dir, normal = +dir (outward)
      b.quadSmooth(d00, d01, d11, d10, d00, d01, d11, d10);
      // inner shell: position = ri*dir, normal = -dir (faces cavity)
      b.quadSmooth(vscale(d00, ri), vscale(d01, ri), vscale(d11, ri), vscale(d10, ri),
        vneg(d00), vneg(d01), vneg(d11), vneg(d10));
    }
  }
  // top hole rim (φ = phiT): flat cone band, faces up-and-inward toward the hole
  for (let j = 0; j < seg; j++) {
    const t0 = (j / seg) * TAU, t1 = ((j + 1) / seg) * TAU, tm = (t0 + t1) / 2;
    const hint = [-Math.cos(phiT) * Math.cos(tm), Math.sin(phiT), -Math.cos(phiT) * Math.sin(tm)];
    b.quadFlat(dir(phiT, t0), dir(phiT, t1), vscale(dir(phiT, t1), ri), vscale(dir(phiT, t0), ri), hint);
  }
  // bottom skirt rim (equator, y=0): flat annulus facing down
  for (let j = 0; j < seg; j++) {
    const t0 = (j / seg) * TAU, t1 = ((j + 1) / seg) * TAU;
    const o0 = [Math.cos(t0), 0, Math.sin(t0)], o1 = [Math.cos(t1), 0, Math.sin(t1)];
    b.quadFlat([ri * o0[0], 0, ri * o0[2]], [ri * o1[0], 0, ri * o1[2]], o1, o0, [0, -1, 0]);
  }
  return b.src();
}

// halfCylinder — half disk (round side +Z, flat face on the z=0 plane) swept +Y.
// Unit radius 1, base half-circle centre at origin, grows to y=1.
function buildHalfCylinder(seg) {
  const b = Builder();
  const arc = (a) => [Math.cos(a), Math.sin(a)];   // a in [0,π] -> z = sin(a) >= 0
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * PI, a1 = ((i + 1) / seg) * PI;
    const c0 = arc(a0), c1 = arc(a1);
    const n0 = [c0[0], 0, c0[1]], n1 = [c1[0], 0, c1[1]];
    b.quadSmooth([c0[0], 0, c0[1]], [c1[0], 0, c1[1]], [c1[0], 1, c1[1]], [c0[0], 1, c0[1]], n0, n1, n1, n0);
    b.triFlat([0, 0, 0], [c0[0], 0, c0[1]], [c1[0], 0, c1[1]], [0, -1, 0]);   // bottom half-disk
    b.triFlat([0, 1, 0], [c0[0], 1, c0[1]], [c1[0], 1, c1[1]], [0, 1, 0]);    // top half-disk
  }
  b.quadFlat([1, 0, 0], [-1, 0, 0], [-1, 1, 0], [1, 1, 0], [0, 0, -1]);       // flat back (z=0)
  return b.src();
}

// archBox — an arch cross-section (semicircle radius 1 centred at origin over a
// unit-tall rectangular body) extruded along +Z to `depth` (a fraction of r).
// Origin = the arch circle's centre. seg = segments over the semicircle.
function buildArchBox(depth, seg) {
  const b = Builder();
  const D = depth;
  const arc = (a) => [Math.cos(a), Math.sin(a)];   // a in [0,π]: over the top, y >= 0
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * PI, a1 = ((i + 1) / seg) * PI;
    const p0 = arc(a0), p1 = arc(a1);
    const n0 = [p0[0], p0[1], 0], n1 = [p1[0], p1[1], 0];
    b.quadSmooth([p0[0], p0[1], 0], [p1[0], p1[1], 0], [p1[0], p1[1], D], [p0[0], p0[1], D], n0, n1, n1, n0); // round arch
  }
  b.quadFlat([-1, -1, 0], [-1, -1, D], [-1, 0, D], [-1, 0, 0], [-1, 0, 0]);   // body left
  b.quadFlat([1, -1, 0], [1, 0, 0], [1, 0, D], [1, -1, D], [1, 0, 0]);        // body right
  b.quadFlat([-1, -1, 0], [1, -1, 0], [1, -1, D], [-1, -1, D], [0, -1, 0]);   // body bottom
  for (const [z, hint] of [[0, [0, 0, -1]], [D, [0, 0, 1]]]) {                // front & back arch faces
    b.quadFlat([-1, -1, z], [1, -1, z], [1, 0, z], [-1, 0, z], hint);         // body rectangle
    for (let i = 0; i < seg; i++) {
      const p0 = arc((i / seg) * PI), p1 = arc(((i + 1) / seg) * PI);
      b.triFlat([0, 0, z], [p0[0], p0[1], z], [p1[0], p1[1], z], hint);       // semicircle fan
    }
  }
  return b.src();
}

// ============================================================================
// public primitives
// ============================================================================

export function box(w, h, d, slope = 0, curve = 0) {
  need(w > 0 && h > 0 && d > 0, "box w,h,d must be > 0");
  need(slope >= 0 && slope <= 1, "box slope in [0,1]");
  need(curve >= -1 && curve <= 1, "box curve in [-1,1]");
  return handle(`box|${r4(slope)}|${r4(curve)}`, () => buildBox(slope, curve),
    [w, h, d], `box|${r4(w)}|${r4(h)}|${r4(d)}|${r4(slope)}|${r4(curve)}`);
}

export function cylinder(r, h, seg = 24) {
  need(r > 0 && h > 0, "cylinder r,h must be > 0");
  need(seg >= 3, "cylinder seg >= 3");
  seg = seg | 0;
  return handle(`cyl|${seg}`, () => buildCylinder(seg), [r, h, r],
    `cyl|${r4(r)}|${r4(h)}|${seg}`);
}

export function coneCut(r0, r1, h, seg = 24) {
  need(r0 > 0 && h > 0, "coneCut r0,h must be > 0");
  need(r1 >= 0, "coneCut r1 must be >= 0");
  need(seg >= 3, "coneCut seg >= 3");
  seg = seg | 0;
  const taper = r1 / r0;
  return handle(`cone|${r4(taper)}|${seg}`, () => buildConeCut(taper, seg), [r0, h, r0],
    `cone|${r4(r0)}|${r4(r1)}|${r4(h)}|${seg}`);
}

export function sphere(r, seg = 24, rings = 16) {
  need(r > 0, "sphere r must be > 0");
  need(seg >= 3 && rings >= 2, "sphere seg>=3, rings>=2");
  seg = seg | 0; rings = rings | 0;
  return handle(`sph|${seg}|${rings}`, () => buildSphere(seg, rings), [r, r, r],
    `sph|${r4(r)}|${seg}|${rings}`);
}

export function cutDome(r, wall, cut, seg = 24, rings = 12) {
  need(r > 0, "cutDome r must be > 0");
  need(wall > 0 && wall < 1, "cutDome wall in (0,1)");
  need(cut > 0 && cut < 1, "cutDome cut in (0,1)");
  need(seg >= 3 && rings >= 1, "cutDome seg>=3, rings>=1");
  seg = seg | 0; rings = rings | 0;
  return handle(`dome|${r4(wall)}|${r4(cut)}|${seg}|${rings}`, () => buildCutDome(wall, cut, seg, rings),
    [r, r, r], `dome|${r4(r)}|${r4(wall)}|${r4(cut)}|${seg}|${rings}`);
}

export function halfCylinder(r, h, seg = 24) {
  need(r > 0 && h > 0, "halfCylinder r,h must be > 0");
  need(seg >= 2, "halfCylinder seg >= 2");
  seg = seg | 0;
  return handle(`half|${seg}`, () => buildHalfCylinder(seg), [r, h, r],
    `half|${r4(r)}|${r4(h)}|${seg}`);
}

export function archBox(r, h, depth, seg = 16) {
  need(r > 0 && h > 0 && depth > 0, "archBox r,h,depth must be > 0");
  need(seg >= 2, "archBox seg >= 2");
  seg = seg | 0;
  const dr = depth / r;                     // arch depth as a ratio of r
  return handle(`arch|${r4(dr)}|${seg}`, () => buildArchBox(dr, seg), [r, h, r],
    `arch|${r4(r)}|${r4(h)}|${r4(depth)}|${seg}`);
}

export const primitives = { box, cylinder, coneCut, sphere, cutDome, halfCylinder, archBox };
