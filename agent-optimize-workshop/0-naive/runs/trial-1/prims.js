// prims.js — procedural primitive surfaces.
//
// Pure math: no Three, no gfx. Every builder returns a "source" object
//   { positions: Float32Array, normals: Float32Array }   (non-indexed triangles)
// which mesh.js hands to gfx.geometryOf() to get a GPU buffer.
//
// All primitives are centred on the origin and, where they have an axis, run
// along +Y. Callers place them with the gfx mesh transforms.

const TAU = Math.PI * 2;
const EPS = 1e-12;

// ---- triangle sink ---------------------------------------------------------
// Orientation is decided per triangle by comparing the geometric normal with the
// vertex normals we already know analytically. That makes winding mistakes
// impossible instead of merely unlikely, and it costs nothing at run time
// (build-time only, a few thousand triangles for a whole robot).

class Sink {
  constructor() {
    this.pos = [];
    this.nrm = [];
  }

  tri(a, b, c, na, nb, nc) {
    // geometric normal of (a, b, c)
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const gx = uy * vz - uz * vy;
    const gy = uz * vx - ux * vz;
    const gz = ux * vy - uy * vx;
    if (gx * gx + gy * gy + gz * gz < EPS) return; // degenerate (pole seam) — drop it

    // average of the intended vertex normals; if the winding disagrees, swap b/c
    const ax = na[0] + nb[0] + nc[0];
    const ay = na[1] + nb[1] + nc[1];
    const az = na[2] + nb[2] + nc[2];
    if (gx * ax + gy * ay + gz * az < 0) {
      this.tri(a, c, b, na, nc, nb);
      return;
    }
    this.pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    this.nrm.push(na[0], na[1], na[2], nb[0], nb[1], nb[2], nc[0], nc[1], nc[2]);
  }

  // quad a-b-c-d (either winding; the tri() check fixes it)
  quad(a, b, c, d, na, nb, nc, nd) {
    this.tri(a, b, c, na, nb, nc);
    this.tri(a, c, d, na, nc, nd);
  }

  done() {
    return {
      positions: new Float32Array(this.pos),
      normals: new Float32Array(this.nrm),
      triangles: this.pos.length / 9,
    };
  }
}

const norm = (v) => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

// ---- memo ------------------------------------------------------------------
// One source object per distinct parameter set, so gfx.geometryOf()'s WeakMap
// yields one GPU buffer per distinct shape no matter how many meshes use it
// (both arms, six fingers, ...). Bounded by the number of distinct shapes a rig
// declares — a few dozen.

const _cache = new Map();
const memo = (key, make) => {
  let s = _cache.get(key);
  if (!s) _cache.set(key, (s = make()));
  return s;
};

// ---- box -------------------------------------------------------------------

export function box(w, h, d) {
  return memo(`box|${w}|${h}|${d}`, () => {
    const s = new Sink();
    const x = w / 2, y = h / 2, z = d / 2;
    // [normal, four corners in order]
    const faces = [
      [[0, 0, 1], [[-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]]],
      [[0, 0, -1], [[x, -y, -z], [-x, -y, -z], [-x, y, -z], [x, y, -z]]],
      [[1, 0, 0], [[x, -y, z], [x, -y, -z], [x, y, -z], [x, y, z]]],
      [[-1, 0, 0], [[-x, -y, -z], [-x, -y, z], [-x, y, z], [-x, y, -z]]],
      [[0, 1, 0], [[-x, y, z], [x, y, z], [x, y, -z], [-x, y, -z]]],
      [[0, -1, 0], [[-x, -y, -z], [x, -y, -z], [x, -y, z], [-x, -y, z]]],
    ];
    for (const [n, [a, b, c, d2]] of faces) s.quad(a, b, c, d2, n, n, n, n);
    return s.done();
  });
}

// ---- cylinder family -------------------------------------------------------
// rb -> radius at -h/2, rt -> radius at +h/2. rt = 0 gives a cone, rt != rb a
// tapered limb, thetaLength < TAU a wedge/half-cylinder (the flat cut faces are
// added so the solid stays closed).

export function cylinder(rb, rt, h, seg = 20, thetaStart = 0, thetaLength = TAU) {
  return memo(`cyl|${rb}|${rt}|${h}|${seg}|${thetaStart}|${thetaLength}`, () => {
    const s = new Sink();
    const y0 = -h / 2, y1 = h / 2;
    const partial = thetaLength < TAU - 1e-6;
    const at = (r, y, t) => [r * Math.cos(t), y, r * Math.sin(t)];
    // side normal for a tapered wall: (h*cos, rb-rt, h*sin) normalised
    const sideN = (t) => norm([h * Math.cos(t), rb - rt, h * Math.sin(t)]);

    for (let i = 0; i < seg; i++) {
      const t0 = thetaStart + (i / seg) * thetaLength;
      const t1 = thetaStart + ((i + 1) / seg) * thetaLength;
      const n0 = sideN(t0), n1 = sideN(t1);
      s.quad(at(rb, y0, t0), at(rb, y0, t1), at(rt, y1, t1), at(rt, y1, t0), n0, n1, n1, n0);
      // caps (fans); skipped where the radius collapsed to a point
      const up = [0, 1, 0], dn = [0, -1, 0];
      if (rt > 0) s.tri([0, y1, 0], at(rt, y1, t0), at(rt, y1, t1), up, up, up);
      if (rb > 0) s.tri([0, y0, 0], at(rb, y0, t0), at(rb, y0, t1), dn, dn, dn);
    }

    if (partial) {
      // the two flat faces on the cut planes
      for (const t of [thetaStart, thetaStart + thetaLength]) {
        const n = norm([Math.sin(t), 0, -Math.cos(t)]); // in-plane, perpendicular to the radius
        s.quad([0, y0, 0], at(rb, y0, t), at(rt, y1, t), [0, y1, 0], n, n, n, n);
      }
    }
    return s.done();
  });
}

export const cone = (r, h, seg = 20) => cylinder(r, 0, h, seg);
export const halfCylinder = (r, h, seg = 16) => cylinder(r, r, h, seg, 0, Math.PI);

// ---- sphere family ---------------------------------------------------------
// phi measured from +Y: 0 = top pole, PI = bottom pole.

export function sphere(r, seg = 24, rings = 16, phiStart = 0, phiLength = Math.PI, cap = true) {
  return memo(`sph|${r}|${seg}|${rings}|${phiStart}|${phiLength}|${cap}`, () => {
    const s = new Sink();
    const at = (p, t) => [
      r * Math.sin(p) * Math.cos(t),
      r * Math.cos(p),
      r * Math.sin(p) * Math.sin(t),
    ];
    const nAt = (p, t) => [Math.sin(p) * Math.cos(t), Math.cos(p), Math.sin(p) * Math.sin(t)];

    for (let j = 0; j < rings; j++) {
      const p0 = phiStart + (j / rings) * phiLength;
      const p1 = phiStart + ((j + 1) / rings) * phiLength;
      for (let i = 0; i < seg; i++) {
        const t0 = (i / seg) * TAU;
        const t1 = ((i + 1) / seg) * TAU;
        s.quad(at(p0, t0), at(p0, t1), at(p1, t1), at(p1, t0),
          nAt(p0, t0), nAt(p0, t1), nAt(p1, t1), nAt(p1, t0));
      }
    }

    // close the open ends of a partial sphere with flat discs
    if (cap) {
      for (const p of [phiStart, phiStart + phiLength]) {
        const rr = r * Math.sin(p);
        if (rr < 1e-6) continue; // it is a pole: already closed
        const y = r * Math.cos(p);
        const n = p === phiStart ? [0, 1, 0] : [0, -1, 0]; // outward = away from the body
        for (let i = 0; i < seg; i++) {
          const t0 = (i / seg) * TAU, t1 = ((i + 1) / seg) * TAU;
          s.tri([0, y, 0],
            [rr * Math.cos(t0), y, rr * Math.sin(t0)],
            [rr * Math.cos(t1), y, rr * Math.sin(t1)], n, n, n);
        }
      }
    }
    return s.done();
  });
}

// dome sitting on a flat face at y = 0 (its own origin), bulging to +Y
export const hemisphere = (r, seg = 24, rings = 10) =>
  sphere(r, seg, rings, 0, Math.PI / 2, true);

// ---- diagnostics -----------------------------------------------------------

export function primStats() {
  let tris = 0;
  for (const s of _cache.values()) tris += s.triangles;
  return { shapes: _cache.size, triangles: tris };
}
