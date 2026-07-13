// joints.js — visible mechanisms. A joint owns its own geometry AND publishes the
// numbers a part needs to meet it, so nothing downstream is placed by eye.
//
//   hinge()      pin + clevis. Two cheeks straddle a gap, a pin runs through them,
//                the child's round lug sits IN the gap and turns on the pin.
//   ballSocket() a ball in a socket cup: 3 DOF, order YXZ (twist, bend, tilt).
//   twistCollar() a rotor turning inside a stator ring: 1 DOF about the collar axis.
//
// Geometry contract for a hinge, all derived from `r` (the cheek radius):
//   pivot        = origin (the pin centre). The child node IS the pivot.
//   gapInner     = gap - CLEAR : the widest a child part may be ACROSS the pin axis.
//   webSpan      = [0.8r, 1.4r] along `web` : where the clevis back sits. A parent
//                  part must reach the pivot to webSpan[0]; a child part must stay
//                  clear of it, which is what caps hinge travel at +-120 deg.

import { HPI, group } from "./gfx.js";
import { box, cylinder, sphere, hemisphere, piece } from "./primitives.js";

const CLEAR = 0.006;         // running clearance between lug and cheeks
export const HINGE_LIMIT = 120; // deg: past this a child rod would drive into the clevis back

const AX = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
const LETTERS = ["x", "y", "z"];

const scaled = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const addv = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

// spin a +Y-axis primitive onto the named axis
const alignTo = (axis) => (axis === "x" ? { rz: -HPI } : axis === "z" ? { rx: HPI } : {});

function dirOf(spec) { // "y+" -> [0,1,0]
  const a = AX[spec[0]];
  if (!a || (spec[1] !== "+" && spec[1] !== "-")) throw new Error(`bad direction "${spec}"`);
  return scaled(a, spec[1] === "+" ? 1 : -1);
}

/**
 * Pin-and-clevis hinge. Clevis + pin are welded to `parent`; the returned node is
 * the child, whose rotation about `axis` happens exactly at the pin centre.
 *
 * @returns {{node, pivot, axis, r, gapInner, webSpan, limit}}
 */
export function hinge(parent, col, {
  origin, axis = "x", r = 0.05, gap = null, cheek = null, pin = null, web = "y+",
}) {
  if (!AX[axis]) throw new Error(`hinge: bad axis "${axis}"`);
  gap = gap ?? r * 1.1;
  cheek = cheek ?? r * 0.3;
  pin = pin ?? r * 0.24;
  const wdir = dirOf(web);
  const a = AX[axis];
  if (Math.abs(a[0] * wdir[0] + a[1] * wdir[1] + a[2] * wdir[2]) > 1e-9)
    throw new Error(`hinge: web "${web}" must be perpendicular to axis "${axis}"`);

  const spin = alignTo(axis);
  const half = gap / 2 + cheek / 2;

  // cheeks: round plates either side of the gap
  piece(parent, cylinder(r, r, cheek), col, { ...spin, at: addv(origin, scaled(a, half)) });
  piece(parent, cylinder(r, r, cheek), col, { ...spin, at: addv(origin, scaled(a, -half)) });
  // pin: through both cheeks, proud on each side so you can see it
  piece(parent, cylinder(pin, pin, gap + 2 * cheek + r * 0.5), col, { ...spin, at: origin });

  // clevis back: bridges the cheeks and welds the fork onto the parent's part
  const dims = { x: 0, y: 0, z: 0 };
  const webLetter = LETTERS.find((L) => Math.abs(wdir[LETTERS.indexOf(L)]) > 0.5);
  const third = LETTERS.find((L) => L !== axis && L !== webLetter);
  dims[axis] = gap + 2 * cheek;
  dims[webLetter] = r * 0.6;
  dims[third] = r * 1.2;
  piece(parent, box(dims.x, dims.y, dims.z), col, { at: addv(origin, scaled(wdir, r * 1.1)) });

  // child: the lug that lives in the gap and turns on the pin
  const node = group(parent, origin);
  const gapInner = gap - CLEAR;
  piece(node, cylinder(r * 0.8, r * 0.8, gapInner), col, { ...spin, at: [0, 0, 0] });

  return { node, pivot: origin, axis, r, gapInner, webSpan: [r * 0.8, r * 1.4], limit: HINGE_LIMIT };
}

/**
 * Cross-section for a bar that turns inside a hinge: the dimension ACROSS the pin is
 * fixed by the cheek gap (so the bar swings between the cheeks, never through them);
 * the other one is free.
 */
export function fitBone(h, free) {
  if (h.axis === "x") return { w: h.gapInner, d: free };
  if (h.axis === "z") return { w: free, d: h.gapInner };
  return { w: free, d: free }; // a y-axis hinge/collar constrains nothing radially
}

/**
 * Ball and socket. Socket cup on the parent, ball on the child; the child node sits
 * at the ball centre, so all three rotations pivot on the ball. Rotation order YXZ
 * = twist, then bend, then tilt.
 *
 * @returns {{node, pivot, ball, exitR}}  exitR = the widest neck that can leave the
 *          cup without touching its rim.
 */
export function ballSocket(parent, col, { origin, ball = 0.085 }) {
  const cup = ball * 1.25;
  piece(parent, hemisphere(cup, false), col, { at: origin });                       // bowl under the ball
  piece(parent, cylinder(cup, cup * 0.9, ball * 0.25), col, { at: addv(origin, [0, -cup * 0.55, 0]) });

  const node = group(parent, origin);
  node.rotation.order = "YXZ";
  piece(node, sphere(ball), col, { at: [0, 0, 0] });
  return { node, pivot: origin, ball, exitR: ball * 0.55 };
}

/**
 * Twist collar: a stator ring on the parent, a rotor inside it on the child.
 * The child turns about +Y at `origin`.
 */
export function twistCollar(parent, col, { origin, r = 0.035, h = 0.05 }) {
  piece(parent, cylinder(r * 1.35, r * 1.35, h * 0.55), col, { at: origin });        // stator
  const node = group(parent, origin);
  piece(node, cylinder(r, r, h), col, { at: [0, 0, 0] });                            // rotor
  piece(node, box(r * 2.3, h * 0.25, r * 0.5), col, { at: [0, h * 0.42, 0] });       // key, so the twist reads
  return { node, pivot: origin, r };
}
