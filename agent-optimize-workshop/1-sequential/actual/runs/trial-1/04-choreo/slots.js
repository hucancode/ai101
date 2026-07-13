// SLOTS — how two pieces of geometry are seated against each other.
//
// A slot { pos, n, f } is a full coordinate frame: an origin, an outward
// normal, and a forward tangent perpendicular to it. Joints publish one slot
// per half (jointMounts); parts re-publish them in part space; a rig names
// which slot mates with which. Nothing is ever positioned by eye.
import { vScale, vNorm, vCross, m3Mul, m3T } from "./math.js";

// a slot forms a full coordinate system: columns [f, n×f, n]
export const slotFrame = (s) => {
  const f = vNorm(s.f), n = vNorm(s.n), b = vCross(n, f);
  return [f[0], b[0], n[0], f[1], b[1], n[1], f[2], b[2], n[2]];
};

// REST rotation seating a child slot against a parent slot: positions
// coincide (handled by the caller's offset), forwards ALIGN, normals OPPOSE —
// the two faces look at each other, so the parts meet instead of overlapping.
export const matchRot = (parentSlot, childSlot) => {
  const f = vNorm(parentSlot.f), n = vScale(vNorm(parentSlot.n), -1);
  const b = vCross(n, f);
  const target = [f[0], b[0], n[0], f[1], b[1], n[1], f[2], b[2], n[2]];
  return m3Mul(target, m3T(slotFrame(childSlot)));
};

// mirrored copy of a slot (X-flip): the other flank of a symmetric rig
export const mirrorSlot = (s) => ({
  pos: [-s.pos[0], s.pos[1], s.pos[2]],
  n: [-s.n[0], s.n[1], s.n[2]],
  f: [-s.f[0], s.f[1], s.f[2]],
});
