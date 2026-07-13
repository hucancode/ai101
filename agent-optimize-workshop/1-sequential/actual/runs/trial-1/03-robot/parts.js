// LAYER 2 — PARTS. Body-piece builders composed from primitives + joint
// halves. Each part is authored in ITS OWN local frame: mount = local
// origin. Body hangs -Y, +Z forward; head and torso grow +Y instead.
//
// Every joint mechanism is already a block (joints.js) — parts only place
// its FIXED half (if this part is the joint's female) and/or its MOVING
// half (if this part is the joint's male), always at the joint's REST pose
// (angle 0). Runtime articulation is entirely the skeleton's job (layer 1):
// a part is one rigid item batch, so a plain external bone rotation at the
// joint's own pivot reproduces the same swing the joint hardware suggests.
import {
  box, cylinder, coneCut, halfCylinder, rotX, rotY, rotZ, translate,
} from "./primitives.js";
import { hingeBlock, hinge1Block, ballBlock, jointMounts, hingeDims, HPI } from "./joints.js";

const noop = () => {};

// shared joint modeling params — one row per mechanism, sized to the robot.
export const J = {
  neck: { ballR: 0.09, socketT: 0.03, cut: 0.7, shaftR: 0.045, shaftLen: 0.04, baseW: 0.24, baseT: 0.02, disc: 1 },
  waist: { ballR: 0.15, socketT: 0.045, cut: 0.7, shaftR: 0.06, shaftLen: 0.06, baseW: 0.36, baseT: 0.035, disc: 1 },
  shoulder: { gap: 0.035, armT: 0.03, armH: 0.13, depth: 0.13, pinR: 0.03, baseH: 0.03 },
  elbow: { gap: 0.03, armT: 0.028, armH: 0.11, depth: 0.11, pinR: 0.024, baseH: 0.025 },
  wristA: { gap: 0.026, armT: 0.024, armH: 0.09, depth: 0.09, pinR: 0.02, baseH: 0.02 },
  wristB: { gap: 0.03, armT: 0.028, armH: 0.1, depth: 0.1, pinR: 0.022, baseH: 0.024 },
  knuckle: { pinR: 0.014, pinLen: 0.16 },
  hip: { gap: 0.04, armT: 0.036, armH: 0.15, depth: 0.15, pinR: 0.034, baseH: 0.035 },
  knee: { gap: 0.036, armT: 0.032, armH: 0.13, depth: 0.13, pinR: 0.03, baseH: 0.03 },
  ankle: { gap: 0.03, armT: 0.028, armH: 0.11, depth: 0.11, pinR: 0.024, baseH: 0.025 },
};

// a plain mount slot (no hardware) — a flat face a part offers a child that
// carries its OWN complete joint (the "mount-to-mount" case: shoulder).
const flatSlot = (pos, n = [0, 1, 0], f = [0, 0, 1]) => ({ pos, n, f });

// ball joint dims: how far the male plate's TOP sits above the ball center
// (mirrors ballDims' `top`, without importing the unexported helper)
const ballTop = (p) => p.ballR + p.shaftLen + p.baseT;

// -- pelvis: half-cylinder shell, axis X, dome down; disc on top. Waist
// socket above, hip fixed halves on the dome's flat end faces. Root.
const PELVIS_R = 0.2, PELVIS_LEN = 0.5, HIP_Y = -0.1;
export function pelvis(add, p) {
  const r = PELVIS_R, len = PELVIS_LEN;
  // shell: halfCylinder's barrel runs Y, round bulge +Z, flat face on XY.
  // rotZ(-HPI) swings the barrel length onto X; rotX(+HPI) swings the round
  // bulge from +Z down to -Y (dome down); origin sits on the flat top plane.
  add(translate(rotX(rotZ(halfCylinder(r, len, 16), -HPI), HPI), -len / 2, 0, 0));
  add(translate(cylinder(r * 0.98, 0.04, 24), 0, -0.02, 0)); // disc capping the flat top
  ballBlock(add, noop, J.waist); // waist socket, seated at pelvis's own origin
  // hip fixed halves on the dome's flat end faces (+-X, the barrel's ends),
  // lowered to mid-dome-height (HIP_Y) rather than the top rim.
  // hingeBlock's natural frame already opens -Y (bridge above, arms hanging
  // to the pin) and the pin runs local X — exactly a fore/aft leg swing, so
  // no extra rotation, just translate out to each end face.
  for (const side of [-1, 1])
    hingeBlock((g) => add(translate(g, side * (len / 2), HIP_Y, 0)), noop, J.hip, { female: { disc: 1 } });
}
export const pelvisSlots = (p) => ({
  mount: flatSlot([0, 0, 0], [0, -1, 0]),
  waist: jointMounts("ball", J.waist).a,
  hipL: { pos: [-PELVIS_LEN / 2, HIP_Y, 0], n: [-1, 0, 0], f: [0, 1, 0] },
  hipR: { pos: [PELVIS_LEN / 2, HIP_Y, 0], n: [1, 0, 0], f: [0, 1, 0] },
});

// -- torso: slab chest: core box, half-cylinder flanks, front panel, waist
// box under it. Neck socket up, a cone seat on each flank, waist ball below.
// Grows +Y; origin = the waist ball's own center (shared with pelvis).
const CHEST_W = 0.56, CHEST_H = 0.46, CHEST_D = 0.26;
export function torso(add, p) {
  ballBlock(noop, add, J.waist); // waist male half, seated at torso's own origin
  const y0 = ballTop(J.waist); // top of the male plate
  const boxH = 0.08;
  add(translate(box(0.32, boxH, 0.2), 0, y0 + boxH / 2, 0));           // waist box
  const chestY = y0 + boxH;
  add(translate(box(CHEST_W, CHEST_H, CHEST_D), 0, chestY + CHEST_H / 2, 0)); // core box
  const flankR = 0.075; // small rounded edge trim, not a dominant dome
  for (const side of [-1, 1]) {
    // halfCylinder's own length axis is already Y (stays vertical); rotY
    // alone swings the round bulge from +Z to face outward, +-X.
    add(translate(rotY(halfCylinder(flankR, CHEST_H * 0.7, 12), side > 0 ? HPI : -HPI),
      side * (CHEST_W / 2), chestY + CHEST_H * 0.15, 0));
  }
  add(translate(box(CHEST_W * 0.85, CHEST_H * 0.55, 0.06), 0, chestY + CHEST_H * 0.5, CHEST_D / 2 + 0.03)); // front panel
  const neckY = chestY + CHEST_H;
  ballBlock((g) => add(translate(g, 0, neckY, 0)), noop, J.neck);      // neck socket, up
  for (const side of [-1, 1]) {                                        // cone seat, each flank (bare mount)
    add(translate(rotZ(coneCut(0.1, 0.06, 0.08, 16), side > 0 ? -HPI : HPI),
      side * (CHEST_W / 2 + 0.06), chestY + CHEST_H * 0.62, 0));
  }
}
export const torsoSlots = (p) => {
  const neckY = ballTop(J.waist) + 0.08 + CHEST_H;
  return {
    mount: jointMounts("ball", J.waist).b,
    neck: flatSlot([0, neckY, 0], [0, 1, 0]),
    shoulderL: flatSlot([-(CHEST_W / 2 + 0.09), neckY - CHEST_H * 0.38, 0], [-1, 0, 0]),
    shoulderR: flatSlot([CHEST_W / 2 + 0.09, neckY - CHEST_H * 0.38, 0], [1, 0, 0]),
  };
};

// -- head: cylinder drum, axis +Z, face = the flat disc. Ball below.
// Grows +Y; origin = the neck ball's own center (shared with torso).
const HEAD_R = 0.17, HEAD_LEN = 0.2;
export function head(add, p) {
  ballBlock(noop, add, J.neck); // neck male half, at head's own origin
  const y0 = ballTop(J.neck) + HEAD_R;
  add(translate(rotX(cylinder(HEAD_R, HEAD_LEN, 20), HPI), 0, y0, -HEAD_LEN / 2));
}
export const headSlots = (p) => ({ mount: jointMounts("ball", J.neck).b });

// -- upperArm: biceps cylinder. The whole shoulder above, elbow clevis + pin
// below. "mount-to-mount hinge": BOTH shoulder halves live here — torso only
// offers a bare cone seat. Rest-built (angle 0); the skeleton bone alone
// articulates armOut/shoulder. rotX(HPI) turns hinge1's natural male exit
// (local +Z) onto -Y so the bicep hangs down; the female mount stays on
// local +X, unaffected by a rotation about X, so it still meets the torso
// cone seat squarely.
const BICEP_R = 0.075, BICEP_LEN = 0.34;
export function upperArm(add, p) {
  const wrap = (g) => rotX(g, HPI);
  hinge1Block((g) => add(wrap(g)), (g) => add(wrap(g)), J.shoulder, {});
  const shoulderDrop = hingeDims(J.shoulder).bridgeY;
  const bicepY = -shoulderDrop - BICEP_LEN;
  add(translate(cylinder(BICEP_R, BICEP_LEN, 16), 0, bicepY, 0));
  hingeBlock((g) => add(translate(g, 0, bicepY, 0)), noop, J.elbow, { female: { disc: 1 } });
}
export const upperArmSlots = (p) => {
  const shoulderDrop = hingeDims(J.shoulder).bridgeY;
  const elbowY = -shoulderDrop - BICEP_LEN;
  return {
    mount: jointMounts("hinge1", J.shoulder).a, // unaffected by the rotX(HPI) wrap
    elbow: flatSlot([0, elbowY, 0], [0, -1, 0]),
  };
};

// -- forearm: box, with a 4-plank shroud sleeving it down to the wrist.
// Elbow male tongue above, wrist stage-A clevis + pin below. Origin = the
// elbow pin height (upperArm's elbow slot); hangs -Y.
const FOREARM_LEN = 0.3, FOREARM_W = 0.1;
export function forearm(add, p) {
  hingeBlock(noop, add, J.elbow);           // elbow male tongue, at forearm's own origin
  const boxY = -0.08;
  add(translate(box(FOREARM_W, 0.14, FOREARM_W * 0.9), 0, boxY, 0));
  const wristY = -FOREARM_LEN;
  const shroudTop = boxY - 0.07, shroudLen = shroudTop - wristY;
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
    add(translate(box(0.022, shroudLen, 0.022), dx * FOREARM_W * 0.42, shroudTop - shroudLen / 2, dz * FOREARM_W * 0.42));
  hingeBlock((g) => add(translate(g, 0, wristY, 0)), noop, J.wristA, { female: { disc: 1 } });
}
export const forearmSlots = (p) => ({
  mount: flatSlot([0, 0, 0], [0, 1, 0]),
  wrist: flatSlot([0, -FOREARM_LEN, 0], [0, -1, 0]),
});

// -- wrist: the middle link. Stage-A male tongue above, the whole stage-B
// hinge below (both halves — simplified like the shoulder: static/rest
// geometry, the skeleton bones alone articulate wristBend/wristTilt).
// rotY(HPI) turns stage-B's pin from local X onto Z, so it flexes on an
// axis perpendicular to stage A's — a universal joint's two stages.
const WRIST_STAGE_B_Y = -0.06;
export function wrist(add, p) {
  hingeBlock(noop, add, J.wristA);          // stage-A male tongue, at wrist's own origin
  const wrapB = (g) => rotY(g, HPI);
  hingeBlock(
    (g) => add(translate(wrapB(g), 0, WRIST_STAGE_B_Y, 0)),
    (g) => add(translate(wrapB(g), 0, WRIST_STAGE_B_Y, 0)),
    J.wristB, { female: { disc: 1 }, male: { disc: 1 } },
  );
}
export const wristSlots = (p) => ({
  mount: flatSlot([0, 0, 0], [0, 1, 0]),
  palm: flatSlot([0, WRIST_STAGE_B_Y, 0], [0, -1, 0]),
});

// -- palm: a block, bolted to stage B's male disc and twisting with it.
// Fingers hang off its side faces: one behind, two in front.
const PALM_W = 0.12, PALM_H = 0.07, PALM_D = 0.12;
export function palm(add, p) {
  add(translate(box(PALM_W, PALM_H, PALM_D), 0, -PALM_H / 2, 0));
}
export const palmSlots = (p) => ({
  mount: flatSlot([0, 0, 0], [0, 1, 0]),
  fingerBack: flatSlot([0, -PALM_H * 0.4, -PALM_D / 2], [0, 0, -1], [0, 1, 0]),
  fingerFrontL: flatSlot([-PALM_W * 0.28, -PALM_H * 0.4, PALM_D / 2], [0, 0, 1], [0, 1, 0]),
  fingerFrontR: flatSlot([PALM_W * 0.28, -PALM_H * 0.4, PALM_D / 2], [0, 0, 1], [0, 1, 0]),
});

// -- finger: 3 box digits on bare pins, pins along X, curling toward each
// other. This builder is ONE digit; the rig chains 3 instances per finger.
// Origin = the digit's own proximal pin; the digit body reaches +Z (its
// own "outward"); a parent REST turns that to match the palm slot it rides.
const DIGIT_LEN = 0.05, DIGIT_W = 0.02;
export function finger(add, p) {
  add(translate(rotZ(cylinder(0.008, 0.03, 8), -HPI), -0.015, 0, 0)); // bare pin
  add(translate(box(DIGIT_W, DIGIT_W * 0.85, DIGIT_LEN), 0, 0, DIGIT_LEN / 2));
}
export const fingerSlots = (p) => ({
  mount: flatSlot([0, 0, 0], [0, 0, -1], [0, 1, 0]),
  tip: flatSlot([0, 0, DIGIT_LEN], [0, 0, 1], [0, 1, 0]),
});

// -- thigh: box. Hip male tongue above, knee clevis + pin below. Origin =
// the hip pin height (pelvis's hip slot); hangs -Y.
const THIGH_LEN = 0.34, THIGH_W = 0.13;
export function thigh(add, p) {
  hingeBlock(noop, add, J.hip);             // hip male tongue, at thigh's own origin
  add(translate(box(THIGH_W, THIGH_LEN, THIGH_W * 0.9), 0, -THIGH_LEN / 2 - 0.02, 0));
  const kneeY = -THIGH_LEN - 0.02;
  hingeBlock((g) => add(translate(g, 0, kneeY, 0)), noop, J.knee, { female: { disc: 1 } });
}
export const thighSlots = (p) => ({
  mount: flatSlot([0, 0, 0], [0, 1, 0]),
  knee: flatSlot([0, -THIGH_LEN - 0.02, 0], [0, -1, 0]),
});

// -- shin: barrel. Knee male U above, ankle clevis + pin below.
const SHIN_LEN = 0.3, SHIN_R = 0.07;
export function shin(add, p) {
  hingeBlock(noop, add, J.knee);            // knee male U, at shin's own origin
  add(translate(cylinder(SHIN_R, SHIN_LEN, 16), 0, -SHIN_LEN - 0.02, 0));
  const ankleY = -SHIN_LEN - 0.02;
  hingeBlock((g) => add(translate(g, 0, ankleY, 0)), noop, J.ankle, { female: { disc: 1 } });
}
export const shinSlots = (p) => ({
  mount: flatSlot([0, 0, 0], [0, 1, 0]),
  ankle: flatSlot([0, -SHIN_LEN - 0.02, 0], [0, -1, 0]),
});

// -- foot: ankle base box under the pin. Slope + toe box forward, heel +
// slope box back. One sole plane, toe to heel. Ankle male tongue on the base.
const FOOT_LEN = 0.24, FOOT_W = 0.11, FOOT_H = 0.06;
export function foot(add, p) {
  hingeBlock(noop, add, J.ankle);           // ankle male tongue, at foot's own origin
  const baseY = -FOOT_H / 2 - 0.02;
  add(translate(box(FOOT_W, FOOT_H, FOOT_W), 0, baseY, 0));                                  // base box under the pin
  add(translate(box(FOOT_W * 0.95, FOOT_H * 0.75, FOOT_LEN * 0.55, 0.35, 0),
    0, baseY - FOOT_H * 0.1, FOOT_LEN * 0.32));                                              // toe box, sloped
  add(translate(box(FOOT_W * 0.85, FOOT_H * 0.65, FOOT_LEN * 0.32, 0.3, 0),
    0, baseY - FOOT_H * 0.08, -FOOT_LEN * 0.3));                                             // heel box, sloped
  add(translate(box(FOOT_W * 0.85, 0.012, FOOT_LEN * 0.92), 0, baseY - FOOT_H * 0.5, FOOT_LEN * 0.04)); // sole plane
}
export const footSlots = (p) => ({ mount: flatSlot([0, 0, 0], [0, 1, 0]) });

// registry: the 11 parts, each { build(add,p), slots(p) } — rig.js drives
// everything through this table, never the bare functions above by name.
export const PARTS = {
  pelvis: { build: pelvis, slots: pelvisSlots },
  torso: { build: torso, slots: torsoSlots },
  head: { build: head, slots: headSlots },
  upperArm: { build: upperArm, slots: upperArmSlots },
  forearm: { build: forearm, slots: forearmSlots },
  wrist: { build: wrist, slots: wristSlots },
  palm: { build: palm, slots: palmSlots },
  finger: { build: finger, slots: fingerSlots },
  thigh: { build: thigh, slots: thighSlots },
  shin: { build: shin, slots: shinSlots },
  foot: { build: foot, slots: footSlots },
};
