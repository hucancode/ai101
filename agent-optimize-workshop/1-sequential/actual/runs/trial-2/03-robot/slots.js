// Slots: full frames (origin, outward normal, forward tangent) published by
// the joints consumers chain through — the ball, and the mount-to-mount
// hinge. Every number here is read from joints.js's derived-dimension
// functions (never re-guessed), so a slot can never drift from what it
// seats on. Slots are REST frames: the static geometry a consumer seats a
// neighbour against, at rest pose — the dynamic pose (swing, rx/ry/rz,
// spins) is a separate rotation the consumer applies on top, same as
// joints.js does internally.
import { m3Mul, m3MulV, m3Rot, m3T, vAdd, vSub, vNorm, vCross } from "./math.js";
import { ball1Dims, mountHingeDims, MOUNT_REST_SWING } from "./joints.js";

function frame(origin, normal, tangent) {
  return { origin, normal: vNorm(normal), tangent: vNorm(tangent) };
}

// ---- ball1: fixed slot at the socket base's outward (downward) face,
// moving slot at the shaft plate's outward (upward) face. No pin to borrow
// a tangent from, so "forward" is an explicit, stable convention (+Z).
export function ballSlots(params = {}) {
  const d = ball1Dims(params);
  return {
    fixed: frame([0, -d.dropBelow - d.baseT, 0], [0, -1, 0], [0, 0, 1]),
    moving: frame([0, d.shaftTop + d.plateT, 0], [0, 1, 0], [0, 0, 1]),
  };
}

// ---- mount-to-mount hinge: fixed slot at the female disc's outward face
// (mount-1), moving slot at the mount-2 turntable's outward face, rotated
// by the same rest-swing baked into the geometry — so the tangent (the pin
// axis) survives the swing untouched, and the two normals end up opposed
// at 90° (the L), matching the built mesh exactly.
export function mountHingeSlots(params = {}) {
  const d = mountHingeDims(params);
  const fixed = frame([0, d.reach + d.baseT, 0], [0, 1, 0], [1, 0, 0]);
  const R = m3Rot("x", MOUNT_REST_SWING);
  const moving = frame(
    m3MulV(R, [0, d.mount2Y, 0]),
    m3MulV(R, [0, -1, 0]),
    m3MulV(R, [1, 0, 0]),
  );
  return { fixed, moving };
}

// Mirror a slot across the sagittal plane (X=0) to get the other flank of a
// symmetric rig (e.g. a left shoulder's slot from a right shoulder's).
export function mirrorSlot(slot) {
  const mx = ([x, y, z]) => [-x, y, z];
  return frame(mx(slot.origin), mx(slot.normal), mx(slot.tangent));
}

// Seat a child slot onto a parent slot: origins coincide, forwards (tangent)
// align, normals oppose. Solved as a change of orthonormal basis (normal,
// tangent, their cross product) — nothing here is positioned by eye.
// Returns a rigid transform { m, t }; apply it to every piece of the
// child's assembly with `seatPiece`, and to any of the child's own
// downstream slots with `seatFrame`, to carry a whole chain along.
export function seat(child, parent) {
  const cN = vNorm(child.normal), cT = vNorm(child.tangent), cB = vNorm(vCross(cN, cT));
  const tN = vNorm(parent.normal).map((v) => -v), tT = vNorm(parent.tangent);
  const tB = vNorm(vCross(tN, tT));
  // columns = (cN,cT,cB) / (tN,tT,tB); child basis is orthonormal, so its
  // inverse is its transpose — R maps child's basis onto the target basis.
  const Cchild = [cN[0], cT[0], cB[0], cN[1], cT[1], cB[1], cN[2], cT[2], cB[2]];
  const Ctarget = [tN[0], tT[0], tB[0], tN[1], tT[1], tB[1], tN[2], tT[2], tB[2]];
  const m = m3Mul(Ctarget, m3T(Cchild));
  const t = vSub(parent.origin, m3MulV(m, child.origin));
  return { m, t };
}

export function seatPiece(x, piece) {
  return { ...piece, m: m3Mul(x.m, piece.m), t: vAdd(x.t, m3MulV(x.m, piece.t)) };
}
export function seatFrame(x, slot) {
  return frame(vAdd(x.t, m3MulV(x.m, slot.origin)), m3MulV(x.m, slot.normal), m3MulV(x.m, slot.tangent));
}
