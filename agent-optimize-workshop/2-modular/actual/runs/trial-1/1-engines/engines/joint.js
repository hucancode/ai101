// joint engine — two mechanisms (hinge, ball) + the mating that seats one part
// on another. This module GENERATES NO GEOMETRY: the caller hands in piece
// mesh-makers, and this engine owns their DIMENSIONS and ROTATING ORIGIN — where
// each piece sits and how it turns. Math + scene-graph placement only.
//
// Conventions (rest orientation — inversions are the classic bug):
//   * The joint origin [0,0,0] is the rotation center (pin axis / ball center).
//   * A half's BODY/base reaches −Y toward the part it belongs to.
//   * At rest (angle 0) the FEMALE (fixed) half's base sits on −Y; the MALE
//     (moving) half reaches +Y, OPPOSITE the female, so a plain joint chains
//     straight through the origin.
//   * Female mount normal points −Y, male mount normal points +Y; `mate` opposes
//     them so a child's male mount seats flush on a parent's female slot.

import {
  HPI, rad,
  vSub, vScale, vNorm, vCross,
  m3Mul, m3T, m3MulV, qFromM3,
  group, attachMesh, translate, rotX,
} from "../gfx.js";

// Default hardware colours (a caller may override via opts.colors).
const COL = {
  female: [0.55, 0.58, 0.62], // steel
  male: [0.82, 0.56, 0.26],   // brass
  pin: [0.28, 0.30, 0.34],    // dark rod
  base: [0.40, 0.42, 0.47],   // mount plate
};

// A mount/slot frame is pure data: a point, an outward normal, and a forward.
const frame = (pos, normal, forward) => ({ pos, normal, forward });

// ── dimensions (every value a pure function of size + slim) ──────────────────
// Tuned small + slim so a joint reads as HARDWARE, not a limb; the REACH is kept
// compact (on the order of the knuckle / ball radius, not multiples of it).

export function hingeDims(size, slim = 0.6) {
  const knuckle = size;                 // knuckle (pin-hole) radius
  const reach = size * 1.3;             // short flat-body reach toward −Y
  const armThick = size * 0.42 * slim;  // one female arm's thickness (Z)
  const tongueThick = size * 0.75 * slim; // wider male tongue thickness (Z)
  const width = size * 1.5;             // flat body width (X)
  const clr = size * 0.10;              // clearance each side of the tongue
  const pinR = size * 0.26;             // pin rod radius
  const armZ = tongueThick / 2 + clr + armThick / 2; // |Z| of each arm's center
  const pinLen = 2 * armZ + armThick + size * 0.2;   // rod spans both outer faces
  return { knuckle, reach, armThick, tongueThick, width, clr, pinR, armZ, pinLen };
}

export function ballDims(size, slim = 0.6) {
  const radius = size;              // ball radius
  const clr = size * 0.06;          // nest clearance (surfaces must NOT coincide)
  const inner = radius + clr;       // socket INNER radius (ball nests inside)
  const wall = size * (0.16 + 0.06 * slim); // shell wall thickness
  const outer = inner + wall;       // socket OUTER radius
  const shaftR = radius * 0.30;     // shaft rod radius
  const hole = radius * 0.58;       // top hole: < ball (captures) > shaft (clears)
  const shaftLen = radius * 1.35;   // shaft reach out the top hole (compact)
  return { radius, clr, inner, wall, outer, shaftR, hole, shaftLen };
}

// ── mount offsets (named distances so a caller lays parts out WITHOUT touching
// raw dims) ──────────────────────────────────────────────────────────────────

export function hingeMounts(size, slim = 0.6) {
  const d = hingeDims(size, slim);
  return {
    reach: d.reach,             // origin → plate mount face (each half)
    disc: d.width * 0.7,        // base plate half-width
    bridge: size * 0.2,         // gap between plate end and base
    clearance: d.clr,
    height: size * 0.3,         // base plate thickness
    seat: d.reach + size * 0.2 + size * 0.3, // origin → base underside (−Y)
  };
}

export function ballMounts(size, slim = 0.6) {
  const d = ballDims(size, slim);
  return {
    reach: d.shaftLen,          // origin → male mount face (+Y, toward child)
    disc: d.outer * 1.05,       // base disc radius
    bridge: size * 0.35,        // neck from socket down to base
    clearance: d.clr,
    top: d.outer,               // dome outer extent (+Y)
    height: size * 0.3,         // base disc thickness
    seat: d.outer + size * 0.35 + size * 0.3, // origin → base underside (−Y)
  };
}

// rest mount frames per mechanism (female −Y, male +Y — apart at rest)
export const hingeFrames = (size, slim = 0.6) => {
  const r = hingeDims(size, slim).reach;
  return {
    female: frame([0, -r, 0], [0, -1, 0], [0, 0, 1]),
    male: frame([0, r, 0], [0, 1, 0], [0, 0, 1]),
  };
};
export const ballFrames = (size, slim = 0.6) => {
  const d = ballDims(size, slim);
  return {
    female: frame([0, -d.outer, 0], [0, -1, 0], [0, 0, 1]),
    male: frame([0, d.shaftLen, 0], [0, 1, 0], [0, 0, 1]),
  };
};

// ── mating ───────────────────────────────────────────────────────────────────
// A slot is a frame { pos, normal, forward }. `mate` SOLVES the rest transform
// that seats a child slot on a parent slot: origins coincide, forwards align,
// normals OPPOSE. Returns { rot (row-major 3x3), quat, pos } — apply to the
// child's local origin. Link tables stay pure data.

function basis(normal, forward) {
  const n = vNorm(normal);
  const f0 = vNorm(forward);
  const s = vNorm(vCross(f0, n));   // side axis
  const f = vCross(n, s);           // re-orthogonalised forward
  // columns [s, n, f] as a row-major 3x3
  return [s[0], n[0], f[0], s[1], n[1], f[1], s[2], n[2], f[2]];
}

export function mate(parent, child) {
  const T = basis(vScale(parent.normal, -1), parent.forward); // oppose parent normal
  const C = basis(child.normal, child.forward);
  const rot = m3Mul(T, m3T(C));                 // maps child basis → target basis
  const pos = vSub(parent.pos, m3MulV(rot, child.pos));
  return { rot, quat: qFromM3(rot), pos };
}

// ── factory: bind the caller's piece makers, return the joint builders ───────
// makers = { plate, pin, socket, ball, disc, box }. Each maker takes the dims
// this engine hands it and returns ONE mesh in the canonical frame:
//   plate({ knuckle, reach, width, thick }) — D-plate: rounded knuckle at the
//       origin, flat body reaching −Y, thickness along Z, pin-hole axis along X.
//   pin({ radius, length })                 — rod centered at origin along X.
//   socket({ inner, outer, hole })          — cut-DOME CAP: upper-half shell over
//       the ball (skirt rim at the equator y=0), top pole sliced into a HOLE at
//       +Y; ball center is the origin.
//   ball({ radius, shaftR, shaftLen })      — sphere at origin + shaft reaching +Y.
//   disc({ radius, height }) / box({ width, height, depth }) — generic base plates.

export function makeJoints(makers) {
  // Place a maker's mesh into a node: transform its local matrix (single-sided,
  // as-authored winding) then attach with a colour. `tf` chains gfx transforms.
  function place(node, mesh, color, tf) {
    mesh.matrixAutoUpdate = false;
    mesh.matrix.identity();
    if (tf) tf(mesh);
    return attachMesh(node, mesh, color);
  }

  // HINGE — female = two arms + pin (fixed), male = one wider tongue (moving,
  // rotates about the pin axis X). Male tongue is re-oriented to reach +Y at
  // rest (flipped 180° about the pin axis), OPPOSITE the female arms' −Y bodies.
  function hinge(size, slim = 0.6, opts = {}) {
    const d = hingeDims(size, slim);
    const m = hingeMounts(size, slim);
    const col = { ...COL, ...(opts.colors || {}) };
    const root = group(null);
    const female = group(root); // fixed
    const male = group(root);   // moving (set male.rotation.x to drive it)
    const base = group(root);

    const armA = makers.plate({ knuckle: d.knuckle, reach: d.reach, width: d.width, thick: d.armThick });
    place(female, armA, col.female, (g) => translate(g, 0, 0, d.armZ));
    const armB = makers.plate({ knuckle: d.knuckle, reach: d.reach, width: d.width, thick: d.armThick });
    place(female, armB, col.female, (g) => translate(g, 0, 0, -d.armZ));
    const pin = makers.pin({ radius: d.pinR, length: d.pinLen });
    place(female, pin, col.pin, null);

    // tongue flipped about X so its body reaches +Y at rest (a det=+1 rotation,
    // winding preserved — the piece stays wound outward).
    const tongue = makers.plate({ knuckle: d.knuckle, reach: d.reach, width: d.width, thick: d.tongueThick });
    place(male, tongue, col.male, (g) => rotX(g, Math.PI));

    const bx = makers.box({ width: m.disc * 2, height: m.height, depth: d.width });
    place(base, bx, col.base, (g) => translate(g, 0, -(d.reach + m.bridge + m.height / 2), 0));

    const f = hingeFrames(size, slim);
    return { root, female, male, base, axis: "x", femaleMount: f.female, maleMount: f.male };
  }

  // BALL — female = cut-dome socket + base (fixed), male = ball + shaft (moving,
  // 3-DOF). Socket dome caps the ball's +Y half; shaft exits the top hole to +Y.
  function ball(size, slim = 0.6, opts = {}) {
    const d = ballDims(size, slim);
    const m = ballMounts(size, slim);
    const col = { ...COL, ...(opts.colors || {}) };
    const root = group(null);
    const female = group(root); // fixed
    const male = group(root);   // moving (set male.rotation x/y/z to drive it)
    const base = group(root);

    const sock = makers.socket({ inner: d.inner, outer: d.outer, hole: d.hole });
    place(female, sock, col.female, null);

    const neckLen = m.top + m.bridge;
    const disc = makers.disc({ radius: m.disc, height: m.height });
    place(base, disc, col.base, (g) => translate(g, 0, -(neckLen + m.height / 2), 0));
    const neck = makers.box({ width: d.shaftR * 1.6, height: neckLen, depth: d.shaftR * 1.6 });
    place(base, neck, col.base, (g) => translate(g, 0, -(neckLen / 2), -d.outer * 0.85));

    const bl = makers.ball({ radius: d.radius, shaftR: d.shaftR, shaftLen: d.shaftLen });
    place(male, bl, col.male, null);

    const f = ballFrames(size, slim);
    return { root, female, male, base, axes: ["x", "y", "z"], femaleMount: f.female, maleMount: f.male };
  }

  // ── composed joint under a static pose ─────────────────────────────────────
  // ball  = 3-DOF, male posed by opts.rx/ry/rz (degrees).
  // hinge = L-seated: male re-seated 90° about the pin axis so parent and child
  //         chain around a corner (plus an optional opts.angle in degrees).
  function composeJoint(name, size, slim = 0.6, opts = {}) {
    if (name === "ball") {
      const j = ball(size, slim, opts);
      j.male.rotation.set(rad(opts.rx || 0), rad(opts.ry || 0), rad(opts.rz || 0));
      return j;
    }
    if (name === "hinge") {
      const j = hinge(size, slim, opts);
      j.male.rotation.x = HPI + rad(opts.angle || 0); // L-seat re-seats the male 90°
      return j;
    }
    throw new Error(`makeJoints: unknown composed joint '${name}'`);
  }

  // ── split helpers ──────────────────────────────────────────────────────────
  // male ball alone
  function maleBall(size, slim = 0.6, opts = {}) {
    const j = ball(size, slim, opts);
    j.root.remove(j.female);
    j.root.remove(j.base);
    return { root: j.root, male: j.male, mount: j.maleMount };
  }
  // female socket seated at a point
  function femaleSocketAt(point, size, slim = 0.6, opts = {}) {
    const j = ball(size, slim, opts);
    j.root.remove(j.male);
    j.root.position.set(point[0], point[1], point[2]);
    return { root: j.root, female: j.female, base: j.base, mount: j.femaleMount };
  }
  // plain hinge split across parent (female clevis + pin) and child (male tongue)
  function splitHinge(size, slim = 0.6, opts = {}) {
    const j = hinge(size, slim, opts);
    j.root.remove(j.male);
    const childRoot = group(null);
    childRoot.add(j.male);
    return {
      parent: { root: j.root, female: j.female, base: j.base, mount: j.femaleMount },
      child: { root: childRoot, male: j.male, mount: j.maleMount },
    };
  }

  return {
    hinge, ball,
    hingeMounts, ballMounts, hingeFrames, ballFrames,
    mate, composeJoint, maleBall, femaleSocketAt, splitHinge,
  };
}
