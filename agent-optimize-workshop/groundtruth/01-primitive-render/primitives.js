import { TAU } from "./math.js";
// PRIMITIVE MESH GENERATORS. Each generator returns a triangle soup
// { positions: number[], normals: number[] } — 3 floats per vertex, 3 vertices
// per triangle, no indices. Flat faces get one shared face normal (tri/quad);
// curved surfaces get per-vertex normals (triS) so lighting shades smoothly.
//
// Origin conventions:
//   box       origin = center, 1x1x1
//   cylinder  origin = center of the BASE circle, body spans y 0..h
//   coneCut   base r=1 at y=0, top r=q at y=1 (q=0 -> true cone)
//   sphere    origin = center, r=1
//   hemisphere origin = center of the base circle, dome up (+Y)

// ---- soup helpers -------------------------------------------------------------

export function geo() {
  return { positions: [], normals: [] };
}

export function tri(g, a, b, c, n) {
  g.positions.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  if (n) g.normals.push(n[0], n[1], n[2], n[0], n[1], n[2], n[0], n[1], n[2]);
}

// triangle with per-vertex (smooth) normals
export function triS(g, a, b, c, na, nb, nc) {
  g.positions.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  g.normals.push(na[0], na[1], na[2], nb[0], nb[1], nb[2], nc[0], nc[1], nc[2]);
}

export function quad(g, a, b, c, d, n) {
  tri(g, a, b, c, n);
  tri(g, a, c, d, n);
}

export function merge(...gs) {
  const out = geo();
  for (const g of gs) {
    out.positions.push(...g.positions);
    out.normals.push(...g.normals);
  }
  return out;
}

export function soupTranslate(g, x, y, z) {
  const p = g.positions;
  for (let i = 0; i < p.length; i += 3) { p[i] += x; p[i + 1] += y; p[i + 2] += z; }
  return g;
}

// ---- unit-mesh generators ----------------------------------------------------

// unit box (1x1x1, centered). slope = FRACTION of the height dropped at the
// top face's front (+Z) edge; curve bends the sloped top (-1 concave, 0
// straight, +1 convex) and only acts when slope > 0.
export function genBox(slope = 0, curve = 0) {
  const g = geo();
  const x = 0.5, y = 0.5, z = 0.5, d = 1;
  const s = Math.max(0, Math.min(slope, 1 - 1e-4));
  const k = Math.max(-1, Math.min(1, curve));
  const N = s > 0 && k !== 0 ? 12 : 1;               // subdivide only when curved
  const yAt = (u) => y - s * (u - k * u * (1 - u));  // top profile, back -> front
  for (let i = 0; i < N; i++) {
    const u0 = i / N, u1 = (i + 1) / N;
    const z0 = -z + d * u0, z1 = -z + d * u1;
    const y0 = yAt(u0), y1 = yAt(u1);
    const l = Math.hypot(d / N, y1 - y0);
    const nt = [0, (z1 - z0) / l, -(y1 - y0) / l];   // strip normal, up + tilt
    quad(g, [-x, y1, z1], [x, y1, z1], [x, y0, z0], [-x, y0, z0], nt);           // top strip
    quad(g, [x, -y, z1], [x, -y, z0], [x, y0, z0], [x, y1, z1], [1, 0, 0]);      // +X wall strip
    quad(g, [-x, -y, z0], [-x, -y, z1], [-x, y1, z1], [-x, y0, z0], [-1, 0, 0]); // -X wall strip
  }
  quad(g, [-x, -y, -z], [x, -y, -z], [x, -y, z], [-x, -y, z], [0, -1, 0]);
  quad(g, [-x, -y, z], [x, -y, z], [x, y - s, z], [-x, y - s, z], [0, 0, 1]);
  quad(g, [x, -y, -z], [-x, -y, -z], [-x, y, -z], [x, y, -z], [0, 0, -1]);
  return g;
}

// arc sweep of a cylinder side + caps. a0..a1 = swept angle range (full
// cylinder: 0..TAU). caps closes top/bottom with fans.
export function cylBody(r, h, seg, a0, a1, caps = true) {
  const g = geo();
  for (let i = 0; i < seg; i++) {
    const t0 = a0 + ((a1 - a0) * i) / seg;
    const t1 = a0 + ((a1 - a0) * (i + 1)) / seg;
    const c0 = Math.cos(t0), s0 = Math.sin(t0);
    const c1 = Math.cos(t1), s1 = Math.sin(t1);
    const p00 = [r * c0, 0, r * s0], p01 = [r * c1, 0, r * s1];
    const p10 = [r * c0, h, r * s0], p11 = [r * c1, h, r * s1];
    const n0 = [c0, 0, s0], n1 = [c1, 0, s1];
    triS(g, p00, p11, p01, n0, n1, n1);
    triS(g, p00, p10, p11, n0, n0, n1);
    if (caps) {
      tri(g, [0, h, 0], p11, p10, [0, 1, 0]);          // top fan
      tri(g, [0, 0, 0], p00, p01, [0, -1, 0]);         // bottom fan
    }
  }
  return g;
}

// unit truncated cone: base r=1 at y=0 to top r=q at y=1. q=0 -> true cone.
export function genConeCut(q, seg) {
  const g = geo();
  const ny = 1 - q;                          // slope -> normal tilt (r0=1, h=1)
  const il = 1 / Math.hypot(1, ny);
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
      tri(g, [0, 1, 0], p11, p10, [0, 1, 0]);            // top cap
    } else {
      triS(g, p00, [0, 1, 0], p01, n0, nrm((c0 + c1) / 2, (s0 + s1) / 2), n1);
    }
    tri(g, [0, 0, 0], p00, p01, [0, -1, 0]);             // base cap
  }
  return g;
}

// unit sphere / hemisphere lathe: phi sweeps 0 (pole) .. phiMax; base=true
// closes the last ring with a downward disc (hemisphere: phiMax = PI/2)
export function genLathe(seg, rings, phiMax, base) {
  const g = geo();
  const pt = (u, v) => {
    const th = u * TAU, ph = v * phiMax;
    const sp = Math.sin(ph);
    return [Math.cos(th) * sp, Math.cos(ph), Math.sin(th) * sp];
  };
  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < seg; i++) {
      const n00 = pt(i / seg, j / rings), n01 = pt((i + 1) / seg, j / rings);
      const n10 = pt(i / seg, (j + 1) / rings), n11 = pt((i + 1) / seg, (j + 1) / rings);
      triS(g, n00, n11, n10, n00, n11, n10);
      triS(g, n00, n01, n11, n00, n01, n11);
    }
  }
  if (base)
    for (let i = 0; i < seg; i++) {         // base disc, facing down
      const t0 = (i / seg) * TAU, t1 = ((i + 1) / seg) * TAU;
      tri(g, [0, 0, 0], [Math.cos(t0), 0, Math.sin(t0)], [Math.cos(t1), 0, Math.sin(t1)], [0, -1, 0]);
    }
  return g;
}
