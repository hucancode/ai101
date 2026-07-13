// Layer 1 — rig machinery. Knows nothing of any particular robot.
//
// A bone is ONE rotation about ONE axis, seated at an offset in the parent
// frame, with an optional fixed REST rotation:
//   world(bone) = world(parent) . T(offset) . REST . R(axis, angle)
// A 3-DOF joint = 3 chained bones, x -> y -> z, each with offset [0,0,0] and
// rest = I except the first, which carries the true seating offset+REST.
import { I3, m3Mul, m3MulV, m3Rot, vAdd } from "./math.js";

export function createSkeleton() {
  const bones = new Map(); // name -> { parent, axis, offset, rest, channel, depth }

  function addBone(name, { parent = null, axis, offset = [0, 0, 0], rest = null, channel = null } = {}) {
    if (bones.has(name)) throw new Error(`skeleton: duplicate bone "${name}"`);
    if (parent != null && !bones.has(parent)) throw new Error(`skeleton: unknown parent "${parent}" for bone "${name}"`);
    if (axis !== "x" && axis !== "y" && axis !== "z") throw new Error(`skeleton: bad axis "${axis}" for bone "${name}"`);
    const depth = parent == null ? 0 : bones.get(parent).depth + 1;
    bones.set(name, { parent, axis, offset, rest, channel, depth });
    return name;
  }

  // pose: { boneName: angleRadians }. Missing entries default to 0.
  function resolve(pose = {}) {
    const world = new Map();
    const visiting = new Set();
    function worldOf(name) {
      const cached = world.get(name);
      if (cached) return cached;
      if (visiting.has(name)) throw new Error(`skeleton: cycle at bone "${name}"`);
      visiting.add(name);
      const b = bones.get(name);
      const angle = pose[name] ?? 0;
      const R = m3Rot(b.axis, angle);
      const localM = b.rest ? m3Mul(b.rest, R) : R;
      const parentX = b.parent == null ? { m: I3, t: [0, 0, 0] } : worldOf(b.parent);
      const w = {
        m: m3Mul(parentX.m, localM),
        t: vAdd(parentX.t, m3MulV(parentX.m, b.offset)),
      };
      world.set(name, w);
      visiting.delete(name);
      return w;
    }
    for (const name of bones.keys()) worldOf(name);
    return world;
  }

  function depthOf(name) {
    if (!bones.has(name)) throw new Error(`skeleton: unknown bone "${name}"`);
    return bones.get(name).depth;
  }

  // channel -> shallowest bone depth that channel drives (first bone added wins).
  function channelDepths() {
    const out = {};
    for (const [, b] of bones) {
      if (b.channel != null && !(b.channel in out)) out[b.channel] = b.depth;
    }
    return out;
  }

  return { addBone, resolve, depthOf, channelDepths, bones };
}
