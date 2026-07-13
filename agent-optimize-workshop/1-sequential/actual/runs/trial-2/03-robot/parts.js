// Layer 2 — parts. Body-piece builders, composed from primitives + joint
// halves. Every part builds RAW, UNBAKED, REST-POSE geometry (zero pose
// passed into every joint builder) in its own local frame where mount =
// local origin. All actual posing happens in rig.js via skeleton bones —
// parts never see a pose channel. Pieces that must ride a bone other than
// the part's own base bone keep the joint builder's `channel` tag so rig.js
// can route them; pieces are also re-origined (see `reOrigin`) so their `t`
// is relative to the bone they'll be seated on, not the joint fn's own
// internal origin.
import { m3Mul, m3MulV, m3Rot, vAdd, vSub } from "./math.js";
import { box, cylinder, coneCut, halfCylinder } from "./primitives.js";
import {
  hinge1Dims, buildHinge1Raw,
  hinge2Dims, hinge2,
  ball1Dims, ball1,
  mountHingeDims, mountHinge,
} from "./joints.js";

// ---- rigid placement helpers (pre-multiply rotation — shape-preserving for
// anisotropic handles too, see joints.js's own rotPiece comment) ------------

export function rot(h, axis, angle, pivot = [0, 0, 0]) {
  if (!angle) return h;
  const R = m3Rot(axis, angle);
  return { ...h, m: m3Mul(R, h.m), t: vAdd(pivot, m3MulV(R, vSub(h.t, pivot))) };
}
export function at(h, t) {
  return { ...h, t };
}
export function moveBy(h, d) {
  return { ...h, t: vAdd(h.t, d) };
}
export const tagged = (h, channel) => ({ ...h, channel });

// Re-express a piece's translation relative to `origin` (used when a piece
// rides a bone whose own local origin differs from the joint fn's origin).
export function reOrigin(h, origin) {
  return { ...h, t: vSub(h.t, origin) };
}
export const reOriginAll = (list, origin) => list.map((h) => reOrigin(h, origin));

function boxAt(w, h, d, center) {
  return { ...box(w, h, d), t: center };
}
function discAt(r, h, center) {
  return { ...cylinder(r, h), t: [center[0], center[1] - h / 2, center[2]] };
}
// cylinder whose axis runs along world/local +X, base at `base`, length `len`
function cylAlongX(r, len, base) {
  return rot({ ...cylinder(r, len), t: base }, "z", -Math.PI / 2, base);
}

export { boxAt, discAt, cylAlongX };

// ---- joint params, one place, shared by parts.js and rig.js ---------------
// Every size here scales the whole rig; nothing downstream re-guesses a
// number that a Dims function already derives.
export const JOINTS = {
  neck: { ballR: 0.1, wallT: 0.03, openFrac: 0.3, shaftTop: 0.05, plateW: 0.22, plateD: 0.16, seg: 16, rings: 8 },
  waist: { ballR: 0.2, wallT: 0.05, openFrac: 0.32, shaftTop: 0.08, plateW: 0.4, plateD: 0.3, seg: 20, rings: 8 },
  shoulder: { pinR: 0.02, knuckleR: 0.045, knuckleLen: 0.05, gap: 0.01, armT: 0.05, reach: 0.09, baseT: 0.025, baseMargin: 0.02, baseD: 0.14 },
  elbow: { pinR: 0.02, knuckleR: 0.04, knuckleLen: 0.05, gap: 0.01, armT: 0.05, reach: 0.07, baseT: 0.02, baseMargin: 0.015, baseD: 0.12, tongue: true, femaleBase: "rect", maleBase: "rect" },
  wrist: { pinR: 0.015, knuckleR: 0.032, knuckleLen: 0.04, gap: 0.008, armT: 0.04, reach: 0.05, baseT: 0.015, baseMargin: 0.01, baseD: 0.09, upper: { tongue: true }, lower: { maleBase: "disc" } },
  hip: { pinR: 0.026, knuckleR: 0.055, knuckleLen: 0.06, gap: 0.012, armT: 0.06, reach: 0.1, baseT: 0.03, baseMargin: 0.025, baseD: 0.17 },
  knee: { pinR: 0.024, knuckleR: 0.05, knuckleLen: 0.06, gap: 0.012, armT: 0.06, reach: 0.08, baseT: 0.024, baseMargin: 0.02, baseD: 0.15, tongue: false, femaleBase: "rect", maleBase: "rect" },
  ankle: { pinR: 0.02, knuckleR: 0.045, knuckleLen: 0.05, gap: 0.01, armT: 0.05, reach: 0.055, baseT: 0.02, baseMargin: 0.015, baseD: 0.13, tongue: true, femaleBase: "rect", maleBase: "rect" },
};

// hinge1/hinge2/mountHinge female/male bases attach `reach + baseT` from the
// pin along the mechanism's own +/-Y — the one number every connector needs.
export const seatDrop = (d) => d.reach + d.baseT;

// ==========================================================================
// head — cylinder drum, axis +Z, face = the flat disc. Ball below.
// Local origin = the neck ball's own origin (its socket seats here from the
// torso side); the drum grows +Y off the ball's moving plate.
// ==========================================================================
const HEAD_R = 0.16, HEAD_LEN = 0.22;

export function head() {
  const nd = ball1Dims(JOINTS.neck);
  const ballPieces = ball1(JOINTS.neck, {}).filter((p) => p.channel === "ball");
  const plateOut = nd.shaftTop + nd.plateT;
  const drumY = plateOut + HEAD_R * 0.7;
  let drum = cylinder(HEAD_R, HEAD_LEN);
  drum = rot(drum, "x", Math.PI / 2);
  drum = moveBy(drum, [0, drumY, -HEAD_LEN / 2]);
  return { pieces: [...ballPieces, tagged(drum, "body")] };
}

// ==========================================================================
// torso — slab chest: core box, half-cylinder flanks, front panel, waist box
// under it. Neck socket up, a cone seat on each flank, waist ball below.
// Local origin = the waist ball's own origin (its plate seats here from the
// pelvis side); everything else grows +Y off that plate.
// ==========================================================================
const CORE_W = 0.5, CORE_H = 0.55, CORE_D = 0.28;
const WAIST_BOX_H = 0.12;
const FLANK_R = 0.09, FLANK_LEN = CORE_H * 0.75;
const CONE_R0 = 0.07, CONE_R1 = 0.045, CONE_H = 0.06;

export function torso() {
  const wd = ball1Dims(JOINTS.waist);
  const ballPieces = ball1(JOINTS.waist, {}).filter((p) => p.channel === "ball");
  const plateOut = wd.shaftTop + wd.plateT;

  const waistBoxY0 = plateOut;
  const coreY0 = waistBoxY0 + WAIST_BOX_H;
  const coreTopY = coreY0 + CORE_H;
  const flankY = coreY0 + CORE_H * 0.6;

  const pieces = [...ballPieces];
  pieces.push(tagged(boxAt(CORE_W * 0.82, WAIST_BOX_H, CORE_D * 0.82, [0, waistBoxY0 + WAIST_BOX_H / 2, 0]), "body"));
  pieces.push(tagged(boxAt(CORE_W, CORE_H, CORE_D, [0, coreY0 + CORE_H / 2, 0]), "body"));
  pieces.push(tagged(boxAt(CORE_W * 0.7, CORE_H * 0.55, 0.06, [0, coreY0 + CORE_H * 0.55, CORE_D / 2 + 0.03]), "body"));

  const coneSeats = {};
  for (const s of [1, -1]) {
    let flank = halfCylinder(FLANK_R, FLANK_LEN);
    flank = rot(flank, "y", s > 0 ? Math.PI / 2 : -Math.PI / 2); // native +Z bulge -> +-X
    flank = moveBy(flank, [s * CORE_W / 2, flankY - FLANK_LEN / 2, 0]);
    pieces.push(tagged(flank, "body"));

    let cone = coneCut(CONE_R0, CONE_R1, CONE_H);
    cone = rot(cone, "z", s > 0 ? -Math.PI / 2 : Math.PI / 2); // native +Y axis -> +-X
    const coneOrigin = [s * (CORE_W / 2 + FLANK_R * 0.4), flankY, 0];
    cone = moveBy(cone, coneOrigin);
    pieces.push(tagged(cone, "body"));
    coneSeats[s] = { origin: [s * (CORE_W / 2 + FLANK_R * 0.4 + CONE_H), flankY, 0] };
  }

  // neck socket: ball1's fixed (socket+base) half, opens +Y already at rest
  const neckOrigin = [0, coreTopY, 0];
  const neckFixed = ball1(JOINTS.neck, {}).filter((p) => p.channel === "fixed");
  for (const p of neckFixed) pieces.push(tagged(moveBy(p, neckOrigin), "body"));

  return { pieces, neckOrigin, coneSeats };
}

// ==========================================================================
// pelvis — half-cylinder shell, axis X, dome down; disc on top. Waist socket
// above, hip fixed halves on the dome's flat end faces. The rig root.
// Local origin = the dome's flat top center (y=0), where the waist ball's
// fixed socket seats, opening +Y already at rest.
// ==========================================================================
const DOME_R = 0.26, DOME_LEN = 0.56;

export function pelvis() {
  const pieces = [];

  // native halfCylinder: extrudes +Y, bulges +Z. rotZ(-90) then rotX(90)
  // carries native-Y -> world X (axis X) and native-Z -> world -Y (dome down).
  let dome = halfCylinder(DOME_R, DOME_LEN);
  dome = rot(dome, "z", -Math.PI / 2);
  dome = rot(dome, "x", Math.PI / 2);
  dome = moveBy(dome, [-DOME_LEN / 2, 0, 0]);
  pieces.push(tagged(dome, "body"));

  pieces.push(tagged(discAt(DOME_R * 1.05, 0.04, [0, 0.02, 0]), "body"));

  const waistFixed = ball1(JOINTS.waist, {}).filter((p) => p.channel === "fixed");
  for (const p of waistFixed) pieces.push(tagged(p, "body")); // already opens +Y at [0,0,0]

  const hipDims = mountHingeDims(JOINTS.hip);
  const hipMount1 = mountHinge(JOINTS.hip, {}).filter((p) => p.channel === "mount1");
  const hipOrigins = {};
  for (const s of [1, -1]) {
    const origin = [s * DOME_LEN / 2, -DOME_R * 0.5, 0];
    for (const p of hipMount1) pieces.push(tagged(moveBy(p, origin), "body"));
    hipOrigins[s] = { origin, pinOrigin: vAdd(origin, [0, -seatDrop(hipDims), 0]) };
  }

  return { pieces, hipOrigins };
}

// ==========================================================================
// upperArm — biceps cylinder. The whole shoulder above, elbow clevis + pin
// below. Carries BOTH halves of the shoulder (an anomalous joint row): its
// pieces split across two bones (mount1Spin, then swing) that rig.js wires
// up — 'mount1' rides the outer bone, everything else (the swinging male,
// the mount-2 turntable, and upperArm's own body) rides the inner one.
// Local origin = the shoulder mountHinge's own pin (shared by both bones).
// ==========================================================================
const UPPER_ARM_R = 0.09, UPPER_ARM_LEN = 0.42;

export function upperArm() {
  const mh = mountHingeDims(JOINTS.shoulder);
  const all = mountHinge(JOINTS.shoulder, {});
  const pieces = all.map((p) => tagged(p, p.channel)); // keep mount1/swing/mount2 tags

  const bicepsTop = mh.mount2Y - 0.02;
  const bicepsBottom = bicepsTop - UPPER_ARM_LEN;
  pieces.push(tagged(at(cylinder(UPPER_ARM_R, UPPER_ARM_LEN), [0, bicepsBottom, 0]), "swing"));

  const elbowDims = hinge1Dims(JOINTS.elbow);
  const elbowOrigin = [0, bicepsBottom - seatDrop(elbowDims), 0];
  const elbowFixed = buildHinge1Raw(elbowDims).fixed;
  for (const p of elbowFixed) pieces.push(tagged(moveBy(p, elbowOrigin), "swing"));

  return { pieces, elbowOrigin };
}

// ==========================================================================
// forearm — box, with a 4-plank shroud sleeving it down to the wrist. Elbow
// male tongue above, wrist stage-A clevis + pin below.
// Local origin = the elbow pin.
// ==========================================================================
const FOREARM_W = 0.11, FOREARM_D = 0.11, FOREARM_LEN = 0.32;
const SHROUD_LEN = 0.13, SHROUD_T = 0.025;

export function forearm() {
  const elbowDims = hinge1Dims(JOINTS.elbow);
  const pieces = buildHinge1Raw(elbowDims).male.map((p) => tagged(p, "body"));

  const boxTop = -seatDrop(elbowDims);
  const boxBottom = boxTop - FOREARM_LEN;
  pieces.push(tagged(boxAt(FOREARM_W, FOREARM_LEN, FOREARM_D, [0, (boxTop + boxBottom) / 2, 0]), "body"));

  const shroudY = boxBottom + SHROUD_LEN / 2;
  const half = { w: FOREARM_W / 2 - SHROUD_T / 2, d: FOREARM_D / 2 - SHROUD_T / 2 };
  for (const [x, z] of [[half.w, 0], [-half.w, 0], [0, half.d], [0, -half.d]]) {
    pieces.push(tagged(boxAt(SHROUD_T, SHROUD_LEN, SHROUD_T, [x, shroudY, z]), "body"));
  }

  const wristOrigin = [0, boxBottom, 0];
  const wristFixed = hinge2(JOINTS.wrist, {}).filter((p) => p.channel === "fixed");
  for (const p of wristFixed) pieces.push(tagged(moveBy(p, wristOrigin), "body"));

  return { pieces, wristOrigin };
}

// ==========================================================================
// wrist — the middle link. Stage-A male tongue above, the whole stage-B
// hinge below. Both stages share one base (an anomalous joint row: wrist
// carries both stage-B halves). Pieces split across two bones — 'rx' rides
// wrist's own base bone (wristBend), 'rz' rides a child bone (wristTilt)
// offset down to the lower pin.
// ==========================================================================
export function wrist() {
  const { lower, pin2Y } = hinge2Dims(JOINTS.wrist);
  const all = hinge2(JOINTS.wrist, {});
  const rx = all.filter((p) => p.channel === "rx").map((p) => tagged(p, "rx"));
  const rz = reOriginAll(all.filter((p) => p.channel === "rz"), [0, pin2Y, 0]).map((p) => tagged(p, "rz"));
  const twistOrigin = [0, -seatDrop(lower), 0]; // in the rz/wristTilt bone's own frame
  return { pieces: [...rx, ...rz], pin2Y, twistOrigin };
}

// ==========================================================================
// palm — a block, bolted to stage B's male disc and twisting with it.
// Fingers hang off its side faces: one behind, two in front.
// Local origin = the wristTwist bone (the disc's outward face).
// ==========================================================================
const PALM_W = 0.075, PALM_H = 0.13, PALM_D = 0.16;
export const FINGER_SIDE = 1; // +X face carries the gripper

export function palm() {
  const pieces = [tagged(boxAt(PALM_W, PALM_H, PALM_D, [0, -PALM_H / 2, 0]), "body")];
  const y = -PALM_H * 0.22;
  const x = FINGER_SIDE * PALM_W / 2;
  const knuckles = [
    [x, y, -PALM_D * 0.28], // one behind
    [x, y, PALM_D * 0.06],  // two in front
    [x, y, PALM_D * 0.34],
  ];
  return { pieces, knuckles };
}

// ==========================================================================
// finger — 3 box digits on bare pins, pins along X, curling toward each
// other. Each digit is built in its own local frame (origin = its own pin,
// where it attaches to the previous link); rig.js chains a bone per pin.
// ==========================================================================
export const DIGIT_LEN = [0.05, 0.04, 0.032];
const DIGIT_W = 0.026, DIGIT_H = 0.022, PIN_R = 0.009;

export function fingerDigit(len) {
  const pin = tagged(cylAlongX(PIN_R, DIGIT_W * 1.25, [-DIGIT_W * 0.625, 0, 0]), "body");
  const box = tagged(boxAt(DIGIT_W, len, DIGIT_H, [0, -len / 2, 0]), "body");
  return [pin, box];
}

// ==========================================================================
// thigh — box. Hip male tongue above, knee clevis + pin below.
// Local origin = the hip pin.
// ==========================================================================
const THIGH_W = 0.13, THIGH_D = 0.13, THIGH_LEN = 0.42;

export function thigh() {
  const hd = mountHingeDims(JOINTS.hip);
  const pieces = mountHinge(JOINTS.hip, {}).filter((p) => p.channel !== "mount1").map((p) => tagged(p, "body"));

  const boxTop = hd.mount2Y - 0.02;
  const boxBottom = boxTop - THIGH_LEN;
  pieces.push(tagged(boxAt(THIGH_W, THIGH_LEN, THIGH_D, [0, (boxTop + boxBottom) / 2, 0]), "body"));

  const kneeDims = hinge1Dims(JOINTS.knee);
  const kneeOrigin = [0, boxBottom - seatDrop(kneeDims), 0];
  const kneeFixed = buildHinge1Raw(kneeDims).fixed;
  for (const p of kneeFixed) pieces.push(tagged(moveBy(p, kneeOrigin), "body"));

  return { pieces, kneeOrigin };
}

// ==========================================================================
// shin — barrel. Knee male U above, ankle clevis + pin below.
// Local origin = the knee pin.
// ==========================================================================
const SHIN_R = 0.075, SHIN_LEN = 0.36;

export function shin() {
  const kneeDims = hinge1Dims(JOINTS.knee);
  const pieces = buildHinge1Raw(kneeDims).male.map((p) => tagged(p, "body"));

  const boxTop = -seatDrop(kneeDims);
  const boxBottom = boxTop - SHIN_LEN;
  pieces.push(tagged(at(cylinder(SHIN_R, SHIN_LEN), [0, boxBottom, 0]), "body"));

  const ankleDims = hinge1Dims(JOINTS.ankle);
  const ankleOrigin = [0, boxBottom - seatDrop(ankleDims), 0];
  const ankleFixed = buildHinge1Raw(ankleDims).fixed;
  for (const p of ankleFixed) pieces.push(tagged(moveBy(p, ankleOrigin), "body"));

  return { pieces, ankleOrigin };
}

// ==========================================================================
// foot — ankle base box under the pin. Slope + toe box forward, heel + slope
// box back. One sole plane, toe to heel. Ankle male tongue on the base.
// Local origin = the ankle pin.
// ==========================================================================
const FOOT_BASE_W = 0.11, FOOT_BASE_D = 0.09, FOOT_BASE_H = 0.045;
const FOOT_SLOPE_LEN = 0.05, FOOT_TOE_LEN = 0.1, FOOT_HEEL_LEN = 0.06;
const FOOT_TOE_H = 0.028, SOLE_T = 0.016;

export function foot() {
  const ankleDims = hinge1Dims(JOINTS.ankle);
  const pieces = buildHinge1Raw(ankleDims).male.map((p) => tagged(p, "body"));

  const baseTop = -seatDrop(ankleDims);
  const baseBottom = baseTop - FOOT_BASE_H;
  pieces.push(tagged(boxAt(FOOT_BASE_W, FOOT_BASE_H, FOOT_BASE_D, [0, (baseTop + baseBottom) / 2, 0]), "body"));

  const frontZ0 = FOOT_BASE_D / 2;
  let slopeF = box(FOOT_BASE_W * 0.9, FOOT_BASE_H, FOOT_SLOPE_LEN, 0.7);
  slopeF = at(slopeF, [0, baseBottom + FOOT_BASE_H / 2, frontZ0 + FOOT_SLOPE_LEN / 2]);
  pieces.push(tagged(slopeF, "body"));
  const toeZ = frontZ0 + FOOT_SLOPE_LEN + FOOT_TOE_LEN / 2;
  pieces.push(tagged(boxAt(FOOT_BASE_W * 0.85, FOOT_TOE_H, FOOT_TOE_LEN, [0, baseBottom + FOOT_TOE_H / 2, toeZ]), "body"));

  const backZ0 = -FOOT_BASE_D / 2;
  let slopeB = box(FOOT_BASE_W * 0.9, FOOT_BASE_H, FOOT_SLOPE_LEN * 0.7, 0.6);
  slopeB = at(slopeB, [0, baseBottom + FOOT_BASE_H / 2, backZ0 - FOOT_SLOPE_LEN * 0.35]);
  pieces.push(tagged(slopeB, "body"));
  const heelZ = backZ0 - FOOT_SLOPE_LEN * 0.7 - FOOT_HEEL_LEN / 2;
  pieces.push(tagged(boxAt(FOOT_BASE_W * 0.85, FOOT_TOE_H, FOOT_HEEL_LEN, [0, baseBottom + FOOT_TOE_H / 2, heelZ]), "body"));

  const soleFront = toeZ + FOOT_TOE_LEN / 2, soleBack = heelZ - FOOT_HEEL_LEN / 2;
  const soleLen = soleFront - soleBack;
  pieces.push(tagged(boxAt(FOOT_BASE_W * 0.8, SOLE_T, soleLen, [0, baseBottom - SOLE_T / 2, (soleFront + soleBack) / 2]), "body"));

  return { pieces };
}

