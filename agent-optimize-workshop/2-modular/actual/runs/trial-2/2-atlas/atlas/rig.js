// atlas — the rig.
//
// A LINK LIST. Each link says four things and no more: which part, whose face it hangs
// off, which mechanism joins them, and where the limb should AIM. The joint engine
// derives the size, the hardware, the seating, the rest rotation and the bones; this file
// computes no position and no rotation of its own.
//
// Two links say a fifth thing, and both are named by the spec:
//   collar — the mechanism itself (a hinge that also spins in its seat)
//   roll   — the back finger's face points the other way, so its pin comes out reversed
//            and one curl channel closes it onto the other two; `roll` turns its whole
//            chain round to face them.
//
// The rig assembles ONCE into a posable node tree. `setPose` only sets bone angles.

import {
  THREE, I3, rad, m3Mul, m3MulV, m3Rot,
  group, attachMesh, colorMemo, groundY,
} from "../gfx.js";
import { build } from "../engines/joint.js";
import { PARTS } from "./parts.js";

const SIDES = ["L", "R"];

// three digits chained make a finger; three fingers per palm — one on the BACK face, two
// on the front.
const FINGERS = [
  { id: "a", anchor: "digit.front.a" },
  { id: "b", anchor: "digit.front.b" },
  { id: "thumb", anchor: "digit.back", roll: 180 },
];
const DIGITS_PER_FINGER = 3;

// ---------------------------------------------------------------------------
// the link list
// ---------------------------------------------------------------------------
// Left and right are the SAME links on the SAME channels, hung off opposite faces. No
// geometry is mirrored and no drive sign is flipped by hand: a mirrored face gives a
// mirrored pin, and the joint engine's bone SIGN carries it.

export function links() {
  const L = [];
  const add = (l) => (L.push(l), l.id);

  add({ id: "waist", base: "waist", parent: "pelvis", anchor: "waist", part: "torso", mech: "ball", aim: "against" });
  add({ id: "neck", base: "neck", parent: "waist", anchor: "neck", part: "head", mech: "ball", aim: "along" });

  for (const s of SIDES) {
    // the arm hangs down off a flank and spins in its seat: it aims AGAINST the torso,
    // whose own body runs up out of the waist.
    add({ id: `shoulder.${s}`, base: "shoulder", parent: "waist", anchor: `shoulder.${s}`, part: "upperArm", mech: "hinge", aim: "against", collar: true });
    add({ id: `elbow.${s}`, base: "elbow", parent: `shoulder.${s}`, anchor: "elbow", part: "forearm", mech: "hinge", aim: "along" });
    add({ id: `wrist.${s}`, base: "wrist", parent: `elbow.${s}`, anchor: "wrist", part: "palm", mech: "universal", aim: "along", collar: true });

    for (const f of FINGERS) {
      let parent = `wrist.${s}`;
      for (let k = 1; k <= DIGITS_PER_FINGER; k++) {
        parent = add({
          id: `knuckle.${s}.${f.id}.${k}`, base: "knuckle",
          parent, anchor: k === 1 ? f.anchor : "tip",
          part: "digit", mech: "hinge", aim: "along",
          roll: k === 1 ? f.roll : undefined,
        });
      }
    }

    add({ id: `hip.${s}`, base: "hip", parent: "pelvis", anchor: `hip.${s}`, part: "thigh", mech: "hinge", aim: "along", collar: true });
    add({ id: `knee.${s}`, base: "knee", parent: `hip.${s}`, anchor: "knee", part: "shin", mech: "hinge", aim: "along" });
    add({ id: `ankle.${s}`, base: "ankle", parent: `knee.${s}`, anchor: "ankle", part: "foot", mech: "hinge", aim: "along" });
  }
  return L;
}

// ---------------------------------------------------------------------------
// the channels — both sides, one channel
// ---------------------------------------------------------------------------
// `base` + `bone` select every bone of that name on every joint of that kind, on BOTH
// sides. Degrees.
//
// `parallel` marks a channel whose sense must SURVIVE the mirror: both arms swing
// forward, not apart. A mirrored anchor face turns the bone's rest axis round with it, so
// the same angle would drive the two sides into each other. A parallel channel is fed
// through the SIGN OF ITS OWN REST AXIS in the parent's space (`axisSign` below) — read
// off the rig, not typed — which cancels exactly that mirror. Only the two spin collars
// need it.

export const CHANNELS = [
  { key: "headYaw", base: "neck", bone: "twist", min: -60, max: 60 },
  { key: "headPitch", base: "neck", bone: "swing", min: -35, max: 35 },

  { key: "waistTwist", base: "waist", bone: "twist", min: -40, max: 40 },
  { key: "waistBend", base: "waist", bone: "swing", min: -25, max: 35 },
  { key: "waistTilt", base: "waist", bone: "bend", min: -25, max: 25 },

  { key: "shoulder", base: "shoulder", bone: "twist", min: -70, max: 100, parallel: true },
  { key: "armOut", base: "shoulder", bone: "swing", min: -80, max: 10 },
  { key: "elbow", base: "elbow", bone: "swing", min: -120, max: 5 },

  { key: "wristBend", base: "wrist", bone: "swing", min: -45, max: 45 },
  { key: "wristTilt", base: "wrist", bone: "swing2", min: -30, max: 30 },
  { key: "wristTwist", base: "wrist", bone: "twist", min: -80, max: 80 },

  // One channel, every knuckle: three digits deep, so 38 deg at a knuckle is 114 deg of
  // fingertip. The far end of the range is MEASURED, not chosen — it is where the two
  // chains' surfaces meet (see the gripper check); one degree more and they close through
  // each other.
  { key: "fingerCurl", base: "knuckle", bone: "swing", min: 0, max: 38 },

  { key: "hip", base: "hip", bone: "twist", min: -40, max: 40, parallel: true },
  { key: "knee", base: "knee", bone: "swing", min: 0, max: 80 },
];

// The legs hold the mech up: the choreographer never sees hip/knee. They stay draggable.
export const HANDS_OFF = new Set(["hip", "knee"]);

// A bone's own axis, expressed in the space of the part the joint hangs off: its rests,
// composed down the chain. Its canonical sign is +1 or -1 — which is exactly what a
// mirrored anchor flips.
function axisSign(joint, bone) {
  let R = I3;
  for (const b of joint.bones) {
    R = m3Mul(R, b.rest);
    if (b.name === bone.name) break;
  }
  const a = m3MulV(R, bone.axis);
  let i = 0;
  for (let k = 1; k < 3; k++) if (Math.abs(a[k]) > Math.abs(a[i])) i = k;
  return a[i] < 0 ? -1 : 1;
}

// ---------------------------------------------------------------------------
// assembly — once
// ---------------------------------------------------------------------------

const _axis = new THREE.Vector3();

export function buildAtlas({ seed = 7 } = {}) {
  const color = colorMemo(seed);
  const parts = Object.create(null);   // link id (or "pelvis") -> the part
  const nodes = Object.create(null);   // link id (or "pelvis") -> the node its meshes hang on
  const boneNodes = Object.create(null);
  const bones = Object.create(null);
  const joints = [];

  const root = group(null);            // the pelvis's own part space
  const rootPart = PARTS.pelvis();
  if (rootPart.plug) throw new Error("the pelvis is the rig's root: it must have no mount");
  parts.pelvis = rootPart;
  nodes.pelvis = root;
  for (const m of rootPart.meshes) attachMesh(root, m, color(m.userData.id));

  for (const link of links()) {
    const host = parts[link.parent];
    const hostNode = nodes[link.parent];
    if (!host) throw new Error(`link "${link.id}": no part "${link.parent}" to hang off`);
    const face = host.anchors[link.anchor];
    if (!face)
      throw new Error(
        `link "${link.id}": part "${link.parent}" has no anchor "${link.anchor}" ` +
        `(has: ${Object.keys(host.anchors).join(", ")})`,
      );

    const part = PARTS[link.part]();
    if (!part.sec) throw new Error(`link "${link.id}": part "${link.part}" has no mount`);

    // the joint derives everything: size, hardware, seating, rest rotations, bones
    const joint = build(link.mech, face, part.sec, {
      aim: link.aim, collar: !!link.collar, name: link.id,
    });

    let prev = hostNode;
    for (const b of joint.bones) {
      const n = group(prev, b.offset, b.rest);
      boneNodes[b.name] = n;
      bones[b.name] = b;
      prev = n;
    }
    for (const h of joint.hardware)
      attachMesh(h.bone === null ? hostNode : boneNodes[h.bone], h.mesh, color(h.id));

    // `roll` turns the child, and its whole chain, round its own axis.
    const rest = link.roll
      ? m3Mul(joint.child.rest, m3Rot("y", rad(link.roll)))
      : joint.child.rest;
    const childNode = group(prev, joint.child.offset, rest);
    for (const m of part.meshes) attachMesh(childNode, m, color(m.userData.id));

    parts[link.id] = part;
    nodes[link.id] = childNode;
    joints.push({ link, joint, face, host });
  }

  // ---- channels -> bones -------------------------------------------------
  const channels = CHANNELS.map((c) => {
    const targets = [];
    for (const { link, joint } of joints) {
      if (link.base !== c.base) continue;
      const name = `${link.id}.${c.bone}`;
      const bone = bones[name];
      if (!bone)
        throw new Error(
          `channel "${c.key}": joint "${link.id}" has no bone "${c.bone}" ` +
          `(has: ${joint.bones.map((b) => b.name).join(", ")})`,
        );
      targets.push({
        node: boneNodes[name],
        bone,
        dir: c.parallel ? axisSign(joint, bone) : 1,
      });
    }
    if (!targets.length) throw new Error(`channel "${c.key}" drives no bone`);
    return { ...c, targets };
  });

  const pose = Object.create(null);
  for (const c of channels) pose[c.key] = 0;

  // The whole of posing: a bone angle per channel. Nothing is rebuilt.
  function setPose(p = pose) {
    for (const c of channels) {
      const deg = p[c.key];
      if (!Number.isFinite(deg))
        throw new Error(`pose channel "${c.key}" is not finite: ${deg}`);
      for (const t of c.targets)
        t.node.quaternion.setFromAxisAngle(
          _axis.set(t.bone.axis[0], t.bone.axis[1], t.bone.axis[2]),
          rad(t.bone.sign * t.dir * deg),
        );
    }
  }

  setPose(pose);      // rest
  groundY(root);      // it stands on the grid

  return {
    root, parts, nodes, joints, bones, boneNodes,
    channels, pose, setPose,
    feet: SIDES.map((s) => nodes[`ankle.${s}`]),
    // what the choreographer is allowed to see
    choreoChannels: channels.filter((c) => !HANDS_OFF.has(c.key)),
  };
}
