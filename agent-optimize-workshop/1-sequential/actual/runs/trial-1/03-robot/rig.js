// LAYER 3 — RIG. Declarative link list: each link names its part, its
// parent, parent slot <-> own slot, and which bone axis each pose channel
// drives. Pelvis is the root.
//
// Every part is built once at REST (angle 0 everywhere — see parts.js);
// articulation is entirely the skeleton's job. So each link just needs an
// OFFSET (its own attachment point, expressed in the parent part's local
// frame — i.e. the parent's own slot position) and, when it carries a pose
// channel, an AXIS to swing on. Left/right pairs share one offset magnitude
// and differ only in the X sign — see the "mirroring" note in parts.js.
import { createSkeleton } from "./skeleton.js";
import { PARTS } from "./parts.js";
import { collect } from "./primitives.js";
import { rad, m3Mul, m3MulV } from "./math.js";

const sk = createSkeleton();

// root
sk.addBone("pelvis", null, [0, 0, 0], null, null);

// waist: pelvis -> torso, ball 3-DOF. All three land at the pelvis's own
// waist-socket point, which IS pelvis's local origin (see parts.js).
sk.addJoint("waist", "pelvis", [0, 0, 0], null, ["x", "y", "z"]);
// torso itself rides the FULL waist chain (its own origin coincides with
// the ball center, so no further offset)
sk.addBone("torso", "waist.z", [0, 0, 0], null, null);

// neck: torso -> head, ball — only 2 of the 3 axes get a pose channel
// (headYaw, headPitch); the third (roll) stays 0, per spec.
const neckOffset = () => PARTS.torso.slots({}).neck.pos;
sk.addJoint("neck", "torso", neckOffset(), null, ["y", "x"]); // yaw then pitch
sk.addBone("head", "neck.x", [0, 0, 0], null, null);

// one arm (side = -1 left, +1 right), one leg — built twice, mirrored by X.
function buildArm(side) {
  const s = side > 0 ? "R" : "L";
  const shoulderOff = PARTS.torso.slots({})[`shoulder${s}`].pos;
  // shoulder: 2 DOF, both external bones (see parts.js upperArm note).
  // spinF (axis x, channel "shoulder") first, then swing (axis y, "armOut").
  sk.addJoint(`shoulder${s}`, "torso", shoulderOff, null, ["x", "y"]);
  sk.addBone(`upperArm${s}`, `shoulder${s}.y`, [0, 0, 0], null, null);
  const elbowOff = PARTS.upperArm.slots({}).elbow.pos;
  sk.addBone(`elbow${s}`, `upperArm${s}`, elbowOff, null, "x");
  sk.addBone(`forearm${s}`, `elbow${s}`, [0, 0, 0], null, null);
  const wristOff = PARTS.forearm.slots({}).wrist.pos;
  sk.addJoint(`wrist${s}`, `forearm${s}`, wristOff, null, ["x", "z"]); // bend then tilt
  sk.addBone(`wristLink${s}`, `wrist${s}.z`, [0, 0, 0], null, null);
  const palmOff = PARTS.wrist.slots({}).palm.pos;
  sk.addBone(`twist${s}`, `wristLink${s}`, palmOff, null, "y");        // wristTwist
  sk.addBone(`palm${s}`, `twist${s}`, [0, 0, 0], null, null);
  const pslots = PARTS.palm.slots({});
  const FINGERS = [["Back", "back"], ["FrontL", "frontL"], ["FrontR", "frontR"]];
  for (const [slotKey, tag] of FINGERS) {
    const mount = pslots[`finger${slotKey}`];
    const rest = slotKey === "Back" ? YFLIP : null; // back finger points -Z
    sk.addBone(`knuckle${s}${tag}`, `palm${s}`, mount.pos, rest, "x");   // curl
    let prev = `knuckle${s}${tag}`;
    const tip = PARTS.finger.slots({}).tip.pos;
    for (let d = 1; d < 3; d++) {
      const name = `digit${s}${tag}${d}`;
      sk.addBone(name, prev, tip, null, null); // static — see parts.js finger note
      prev = name;
    }
  }
}
const YFLIP = [-1, 0, 0, 0, 1, 0, 0, 0, -1]; // rotY(pi): flips X and Z, keeps Y

function buildLeg(side) {
  const s = side > 0 ? "R" : "L";
  const hipOff = PARTS.pelvis.slots({})[`hip${s}`].pos;
  sk.addBone(`hip${s}`, "pelvis", hipOff, null, "x");
  sk.addBone(`thigh${s}`, `hip${s}`, [0, 0, 0], null, null);
  const kneeOff = PARTS.thigh.slots({}).knee.pos;
  sk.addBone(`knee${s}`, `thigh${s}`, kneeOff, null, "x");
  sk.addBone(`shin${s}`, `knee${s}`, [0, 0, 0], null, null);
  const ankleOff = PARTS.shin.slots({}).ankle.pos;
  sk.addBone(`ankle${s}`, `shin${s}`, ankleOff, null, null); // no pose channel
  sk.addBone(`foot${s}`, `ankle${s}`, [0, 0, 0], null, null);
}

buildArm(-1); buildArm(1);
buildLeg(-1); buildLeg(1);

// pose channels (14, degrees) -> the bone(s) each one drives. "Each drives
// BOTH sides"; curl drives all 6 knuckles (the fingers' inner digit).
const CHANNELS = {
  headYaw: ["neck.y"], headPitch: ["neck.x"],
  twist: ["waist.y"], waistBend: ["waist.x"], waistTilt: ["waist.z"],
  shoulder: ["shoulderL.x", "shoulderR.x"], armOut: ["shoulderL.y", "shoulderR.y"],
  elbow: ["elbowL", "elbowR"],
  wristBend: ["wristL.x", "wristR.x"], wristTilt: ["wristL.z", "wristR.z"],
  wristTwist: ["twistL", "twistR"],
  curl: [],
  hip: ["hipL", "hipR"], knee: ["kneeL", "kneeR"],
};
for (const s of ["L", "R"]) for (const tag of ["back", "frontL", "frontR"]) CHANNELS.curl.push(`knuckle${s}${tag}`);

// each pose channel's bone depth (root = 0) — so a consumer (main.js) can
// tell root-near joints from far ones without hand-keeping that list itself.
export const CHANNEL_DEPTH = {};
for (const [ch, bones] of Object.entries(CHANNELS)) CHANNEL_DEPTH[ch] = sk.depthOf(bones[0]);

function poseToAngles(pose) {
  const angles = {};
  for (const [ch, bones] of Object.entries(CHANNELS)) {
    const v = rad(pose[ch] || 0);
    for (const b of bones) angles[b] = v;
  }
  return angles;
}

// instances: { key, part, bone } — which part rides which bone. Fingers are
// 3 chained instances of the ONE "finger" part (knuckle, then 2 static digits).
const LINKS = [
  { key: "pelvis", part: "pelvis", bone: "pelvis" },
  { key: "torso", part: "torso", bone: "torso" },
  { key: "head", part: "head", bone: "head" },
];
for (const s of ["L", "R"]) {
  LINKS.push({ key: `upperArm${s}`, part: "upperArm", bone: `upperArm${s}` });
  LINKS.push({ key: `forearm${s}`, part: "forearm", bone: `forearm${s}` });
  LINKS.push({ key: `wrist${s}`, part: "wrist", bone: `wristLink${s}` });
  LINKS.push({ key: `palm${s}`, part: "palm", bone: `palm${s}` });
  for (const tag of ["back", "frontL", "frontR"]) {
    LINKS.push({ key: `finger${s}${tag}1`, part: "finger", bone: `knuckle${s}${tag}` });
    LINKS.push({ key: `finger${s}${tag}2`, part: "finger", bone: `digit${s}${tag}1` });
    LINKS.push({ key: `finger${s}${tag}3`, part: "finger", bone: `digit${s}${tag}2` });
  }
  LINKS.push({ key: `thigh${s}`, part: "thigh", bone: `thigh${s}` });
  LINKS.push({ key: `shin${s}`, part: "shin", bone: `shin${s}` });
  LINKS.push({ key: `foot${s}`, part: "foot", bone: `foot${s}` });
}

// parts are always built at REST (parts.js bakes no pose), so their local
// item batches never change across frames or poses — only the skeleton's
// world transform does. Cache the local build per (part, seed).
const localCache = new Map();
function localItemsOf(partName, seed) {
  const k = `${partName}:${seed}`;
  let v = localCache.get(k);
  if (!v) localCache.set(k, (v = collect(PARTS[partName].build, seed, {}, {}).items));
  return v;
}

// atlasModel(seed, pose) -> { items, meshes }. items carry
// { key, mesh, m, t, color }: every part instance's local items, composed
// with its bone's world transform.
export function atlasModel(seed = 1, pose = {}) {
  const world = sk.resolve(poseToAngles(pose));
  const items = [];
  const meshes = {};
  for (const link of LINKS) {
    const w = world.get(link.bone);
    if (!w) throw new Error(`rig: unknown bone ${link.bone}`);
    for (const it of localItemsOf(link.part, seed)) {
      const m = m3Mul(w.m, it.m);
      const t = m3MulV(w.m, it.t);
      t[0] += w.t[0]; t[1] += w.t[1]; t[2] += w.t[2];
      items.push({ key: `${link.key}:${it.key}`, mesh: it.mesh, m, t, color: it.color });
      if (!meshes[it.key]) meshes[it.key] = it.mesh;
    }
  }
  return { items, meshes };
}

export { sk as skeleton };
