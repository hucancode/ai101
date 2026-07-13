// Layer 3 — rig. Declarative link list: each link names its part, its
// parent, parent slot <-> own slot, and which bone axis each pose channel
// drives. Pelvis is the root. The rig owns the skeleton, so it also
// publishes each pose channel's bone depth (root = 0) — CHANNEL_DEPTHS below
// — so nothing downstream hand-keeps a list of which joints are root-near.
import { I3, rad, m3Rot } from "./math.js";
import { createSkeleton } from "./skeleton.js";
import { seatPiece } from "./slots.js";
import { makeColorer } from "./color.js";
import * as PT from "./parts.js";

const sk = createSkeleton();
const attachments = []; // { bone: name|null, piece } — geometry is pose-independent, built once

function attach(boneName, pieces) {
  for (const p of pieces) attachments.push({ bone: boneName, piece: p });
}

// ---- pelvis: rig root, no bone (identity), embeds waist+hip fixed halves --
const pelvisOut = PT.pelvis();
attach(null, pelvisOut.pieces);

// ---- waist (pelvis -> torso): ball, 3 DOF. x=bend, y=twist, z=tilt --------
sk.addBone("waistX", { axis: "x", channel: "waistBend" });
sk.addBone("waistY", { parent: "waistX", axis: "y", channel: "twist" });
sk.addBone("waistZ", { parent: "waistY", axis: "z", channel: "waistTilt" });
const torsoOut = PT.torso();
attach("waistZ", torsoOut.pieces);

// ---- neck (torso -> head): ball. x=pitch, y=yaw, z unused -----------------
sk.addBone("neckX", { parent: "waistZ", axis: "x", offset: torsoOut.neckOrigin, channel: "headPitch" });
sk.addBone("neckY", { parent: "neckX", axis: "y", channel: "headYaw" });
sk.addBone("neckZ", { parent: "neckY", axis: "z" });
const headOut = PT.head();
attach("neckZ", headOut.pieces);

// ---- arm (torso -> upperArm -> forearm -> wrist -> palm -> 3 fingers) -----
// shoulder is the anomalous row: BOTH mount-to-mount-hinge halves live in
// upperArm. 'mount1' rides the outer (shoulder-spin) bone; everything else
// (the swinging male, the mount-2 turntable, upperArm's own body) rides the
// inner (armOut) bone — mountHinge's own tags do this split for free.
function buildArm(s) {
  const side = s > 0 ? "R" : "L";
  const coneOrigin = torsoOut.coneSeats[s].origin;
  sk.addBone(`shoulderSpin_${side}`, {
    parent: "waistZ", axis: "y", offset: coneOrigin,
    rest: m3Rot("z", -s * Math.PI / 2), channel: "shoulder",
  });
  sk.addBone(`armOut_${side}`, { parent: `shoulderSpin_${side}`, axis: "x", channel: "armOut" });
  const upperOut = PT.upperArm();
  attach(`shoulderSpin_${side}`, upperOut.pieces.filter((p) => p.channel === "mount1"));
  attach(`armOut_${side}`, upperOut.pieces.filter((p) => p.channel !== "mount1"));

  sk.addBone(`elbow_${side}`, { parent: `armOut_${side}`, axis: "x", offset: upperOut.elbowOrigin, channel: "elbow" });
  const forearmOut = PT.forearm();
  attach(`elbow_${side}`, forearmOut.pieces);

  sk.addBone(`wristBend_${side}`, { parent: `elbow_${side}`, axis: "x", offset: forearmOut.wristOrigin, channel: "wristBend" });
  const wristOut = PT.wrist();
  attach(`wristBend_${side}`, wristOut.pieces.filter((p) => p.channel === "rx"));

  sk.addBone(`wristTilt_${side}`, { parent: `wristBend_${side}`, axis: "z", offset: [0, wristOut.pin2Y, 0], channel: "wristTilt" });
  attach(`wristTilt_${side}`, wristOut.pieces.filter((p) => p.channel === "rz"));

  sk.addBone(`wristTwist_${side}`, { parent: `wristTilt_${side}`, axis: "y", offset: wristOut.twistOrigin, channel: "wristTwist" });
  const palmOut = PT.palm();
  attach(`wristTwist_${side}`, palmOut.pieces);

  const [len0, len1, len2] = PT.DIGIT_LEN;
  for (let i = 0; i < palmOut.knuckles.length; i++) {
    const fb = `finger${i}_${side}`;
    const knuckle = palmOut.knuckles[i];
    const shift = (p) => ({ ...p, t: [p.t[0] + knuckle[0], p.t[1] + knuckle[1], p.t[2] + knuckle[2]] });
    attach(`wristTwist_${side}`, PT.fingerDigit(len0).map(shift)); // base digit: static, no bone

    sk.addBone(`${fb}_curl1`, { parent: `wristTwist_${side}`, axis: "x", offset: knuckle, channel: "curl" });
    attach(`${fb}_curl1`, PT.fingerDigit(len1));

    sk.addBone(`${fb}_curl2`, { parent: `${fb}_curl1`, axis: "x", offset: [0, -len1, 0], channel: "curl" });
    attach(`${fb}_curl2`, PT.fingerDigit(len2));
  }
}
buildArm(1);
buildArm(-1);

// ---- leg (pelvis -> thigh -> shin -> foot): hip is a NORMAL-split mount- --
// to-mount hinge (unlike shoulder): pelvis holds 'mount1' (static, no bone
// needed — hip has no spin channel), thigh holds 'swing'+'mount2'.
function buildLeg(s) {
  const side = s > 0 ? "R" : "L";
  const pin = pelvisOut.hipOrigins[s].pinOrigin;
  sk.addBone(`hip_${side}`, { axis: "x", offset: pin, channel: "hip" });
  const thighOut = PT.thigh();
  attach(`hip_${side}`, thighOut.pieces);

  sk.addBone(`knee_${side}`, { parent: `hip_${side}`, axis: "x", offset: thighOut.kneeOrigin, channel: "knee" });
  const shinOut = PT.shin();
  attach(`knee_${side}`, shinOut.pieces);

  sk.addBone(`ankle_${side}`, { parent: `knee_${side}`, axis: "x", offset: shinOut.ankleOrigin });
  const footOut = PT.foot();
  attach(`ankle_${side}`, footOut.pieces);
}
buildLeg(1);
buildLeg(-1);

// ---- publish: pose channel -> shallowest bone depth (root = 0) ------------
export const CHANNEL_DEPTHS = sk.channelDepths();
export const POSE_CHANNELS = Object.keys(CHANNEL_DEPTHS);

// ---- atlasModel(seed, pose) -> { items, meshes } ---------------------------
// pose: { channelName: degrees }. Missing channels default to 0 (rest pose).
export function atlasModel(seed, pose = {}) {
  const boneAngles = {};
  for (const [name, b] of sk.bones) {
    if (b.channel && pose[b.channel] != null) boneAngles[name] = rad(pose[b.channel]);
  }
  const world = sk.resolve(boneAngles);
  const colorOf = makeColorer(seed);
  const items = [];
  const meshByKey = new Map();
  for (const { bone, piece } of attachments) {
    const boneWorld = bone ? world.get(bone) : { m: I3, t: [0, 0, 0] };
    const posed = seatPiece(boneWorld, piece);
    const item = { key: posed.key, mesh: posed.mesh, m: posed.m, t: posed.t, color: colorOf(posed.id) };
    items.push(item);
    if (!meshByKey.has(item.key)) meshByKey.set(item.key, item.mesh);
  }
  return { items, meshes: [...meshByKey.values()] };
}
