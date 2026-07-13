// LAYER 1 — SKELETON. Rig machinery, knows nothing of any particular robot.
//
// A bone is ONE rotation about ONE axis, seated at an offset in the parent
// frame, with an optional fixed REST rotation:
//   world(bone) = world(parent) . T(offset) . REST . R(axis, angle)
// A 3-DOF joint = 3 chained bones, x -> y -> z. Unused axes stay 0.
import { I3, m3Mul, m3MulV, m3Rot, vAdd } from "./math.js";

export function createSkeleton() {
  const bones = [];       // ordered so parents always precede children
  const byName = new Map();

  // offset: [x,y,z] in the parent's frame. rest: 9-number row-major mat3
  // (defaults to identity). axis: 'x' | 'y' | 'z' | null (null = never
  // driven by any pose channel, angle is always 0).
  function addBone(name, parent, offset, rest, axis) {
    if (byName.has(name)) throw new Error(`bone ${name} already exists`);
    const b = { name, parent, offset, rest: rest || I3, axis: axis || null, depth: parent ? byName.get(parent).depth + 1 : 0 };
    byName.set(name, b);
    bones.push(b);
    return b;
  }

  // convenience: an N-DOF joint = N chained bones sharing one seat (offset +
  // REST land on the FIRST bone only; the rest just add their own rotation
  // at the same point). axes eg. ['x','y','z'] or ['y'] for a single hinge.
  function addJoint(prefix, parent, offset, rest, axes) {
    let p = parent;
    let off = offset, rst = rest;
    const names = [];
    for (const ax of axes) {
      const name = `${prefix}.${ax}`;
      addBone(name, p, off, rst, ax);
      names.push(name);
      p = name;
      off = [0, 0, 0];
      rst = I3;
    }
    return names[names.length - 1]; // the chain's tip - what children mount to
  }

  function depthOf(name) {
    return byName.get(name).depth;
  }

  // forward kinematics: pose = { boneName: angleRadians }. Returns
  // Map name -> { m: mat3 (world rotation), t: vec3 (world position) }.
  function resolve(pose = {}) {
    const world = new Map();
    for (const b of bones) {
      const pw = b.parent ? world.get(b.parent) : { m: I3, t: [0, 0, 0] };
      const t = vAdd(pw.t, m3MulV(pw.m, b.offset));
      const angle = b.axis ? pose[b.name] || 0 : 0;
      const local = angle ? m3Mul(b.rest, m3Rot(b.axis, angle)) : b.rest;
      const m = m3Mul(pw.m, local);
      world.set(b.name, { m, t });
    }
    return world;
  }

  return { addBone, addJoint, resolve, depthOf, bones };
}
