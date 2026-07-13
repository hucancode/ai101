// rig.js — the robot: a posable scene graph of primitive parts.
//
// Structure is a joint tree (gfx `group` nodes). A joint owns its meshes in its
// OWN frame, so posing is nothing but `node.rotation.set(...)` — Three composes
// the world transforms. Nothing here does vertex work per frame.
//
//   carrier                 (hop / global bounce; choreo owns .position.y)
//    └ root                 (grounded every frame so the soles touch y = 0)
//       └ pelvis
//          ├ torso ─ neck ─ head
//          │   ├ shoulderL ─ elbowL ─ wristL ─ (3 fingers x 2 knuckles)
//          │   └ shoulderR ─ ...
//          ├ hipL ─ kneeL ─ ankleL
//          └ hipR ─ ...

import { group, attachMesh, colorMemo, m3Rot, rad } from "./gfx.js";
import { box, cylinder, sphere, hemisphere, cone } from "./prims.js";
import { mesh, place } from "./mesh.js";

// ---- proportions (metres) --------------------------------------------------
// One table so the figure can be retuned without hunting through the builder.
export const D = {
  pelvisY: 0.95,            // pelvis joint height in the rest pose
  pelvis: [0.30, 0.16, 0.20],
  waistR: 0.10, waistH: 0.10,
  chest: [0.40, 0.34, 0.24],
  chestY: 0.26,             // chest centre, in the torso frame
  shoulderX: 0.235, shoulderY: 0.36, shoulderR: 0.085,
  upperArmR: 0.055, upperArmL: 0.28,
  elbowR: 0.06,
  foreArmR: 0.05, foreArmL: 0.26,
  palm: [0.085, 0.07, 0.10],
  fingerR: 0.017, fingerL: 0.075,
  neckR: 0.05, neckH: 0.09,
  headR: 0.145,
  hipX: 0.115, hipY: -0.08, hipR: 0.08,
  thighTop: 0.075, thighBot: 0.062, thighL: 0.42,
  kneeR: 0.066,
  shinTop: 0.058, shinBot: 0.048, shinL: 0.40,
  foot: [0.14, 0.06, 0.24],
  footFwd: 0.055,           // foot centre pushed forward of the ankle
};

// Named joints the choreographer may drive. Anything not listed stays at rest.
export const JOINTS = [
  "pelvis", "torso", "neck",
  "shoulderL", "elbowL", "wristL",
  "shoulderR", "elbowR", "wristR",
  "hipL", "kneeL", "ankleL",
  "hipR", "kneeR", "ankleR",
];

// A limb hangs DOWN from its joint: a piece of length L centred at -L/2.
const down = (len) => [0, -len / 2, 0];

// ---- arm -------------------------------------------------------------------
// side: +1 = the robot's left (+X), -1 = its right. Mirrored parts keep the same
// colour id on both sides — same part id => same colour (lego rule).

function buildArm(torso, side, c) {
  const s = side > 0 ? "L" : "R";

  // shoulder ball is part of the torso, the joint sits inside it
  attachMesh(torso, mesh(sphere(D.shoulderR, 18, 12)), c("shoulder"),
    [side * D.shoulderX, D.shoulderY, 0]);

  const shoulder = group(torso, [side * D.shoulderX, D.shoulderY, 0]);
  attachMesh(shoulder, mesh(cylinder(D.upperArmR, D.upperArmR * 0.92, D.upperArmL, 16)),
    c("upperArm"), down(D.upperArmL));
  attachMesh(shoulder, mesh(sphere(D.elbowR, 16, 10)), c("elbow"), [0, -D.upperArmL, 0]);

  const elbow = group(shoulder, [0, -D.upperArmL, 0]);
  attachMesh(elbow, mesh(cylinder(D.foreArmR * 1.05, D.foreArmR * 0.85, D.foreArmL, 16)),
    c("foreArm"), down(D.foreArmL));

  const wrist = group(elbow, [0, -D.foreArmL - 0.02, 0]);
  attachMesh(wrist, mesh(box(...D.palm)), c("palm"), [0, -D.palm[1] / 2, 0]);

  // three-finger gripper: two fingers forward-ish, one opposed thumb.
  // Each knuckle is a `rest` rotation, so the finger splays without eating the
  // node's own rotation — a grip animation could still drive these.
  const fingers = [
    { id: "fingerA", at: [0, -D.palm[1], 0.030], splay: rad(14), axis: "x" },
    { id: "fingerB", at: [0, -D.palm[1], -0.030], splay: rad(-14), axis: "x" },
    { id: "thumb", at: [side * 0.038, -D.palm[1] + 0.012, 0], splay: rad(-side * 38), axis: "z" },
  ];
  for (const f of fingers) {
    const knuckle = group(wrist, f.at, m3Rot(f.axis, f.splay));
    attachMesh(knuckle, mesh(cylinder(D.fingerR, D.fingerR * 0.85, D.fingerL, 10)),
      c(f.id), down(D.fingerL));
    // distal segment, curled in toward the palm
    const tipRest = f.id === "thumb" ? m3Rot("z", rad(side * 30)) : m3Rot("x", rad(-Math.sign(f.at[2] || 1) * 30));
    const tip = group(knuckle, [0, -D.fingerL, 0], tipRest);
    attachMesh(tip, mesh(cone(D.fingerR * 0.85, D.fingerL * 0.7, 10)), c("fingertip"),
      [0, -D.fingerL * 0.35, 0]);
  }

  return { [`shoulder${s}`]: shoulder, [`elbow${s}`]: elbow, [`wrist${s}`]: wrist };
}

// ---- leg -------------------------------------------------------------------

function buildLeg(pelvis, side, c) {
  const s = side > 0 ? "L" : "R";

  const hip = group(pelvis, [side * D.hipX, D.hipY, 0]);
  attachMesh(hip, mesh(sphere(D.hipR, 18, 12)), c("hip"), [0, 0, 0]);
  attachMesh(hip, mesh(cylinder(D.thighTop, D.thighBot, D.thighL, 18)), c("thigh"), down(D.thighL));
  attachMesh(hip, mesh(sphere(D.kneeR, 16, 10)), c("knee"), [0, -D.thighL, 0]);

  const knee = group(hip, [0, -D.thighL, 0]);
  attachMesh(knee, mesh(cylinder(D.shinTop, D.shinBot, D.shinL, 18)), c("shin"), down(D.shinL));
  // calf plate — a half-cylinder flat-side forward, so it reads as a shell
  attachMesh(knee, place(halfCylinderShell(), { rz: 0, ry: -Math.PI / 2 }), c("calf"),
    [0, -D.shinL * 0.45, -0.035]);

  const ankle = group(knee, [0, -D.shinL, 0]);
  attachMesh(ankle, mesh(sphere(D.shinBot * 1.05, 14, 8)), c("ankle"), [0, 0, 0]);
  attachMesh(ankle, mesh(box(...D.foot)), c("foot"),
    [0, -D.foot[1] / 2 - 0.015, D.footFwd]);
  attachMesh(ankle, mesh(box(D.foot[0] * 0.8, 0.035, 0.06)), c("toe"),
    [0, -D.foot[1] / 2 - 0.015, D.footFwd + D.foot[2] / 2 + 0.025]);

  return { [`hip${s}`]: hip, [`knee${s}`]: knee, [`ankle${s}`]: ankle };
}

// the calf shell: a half-cylinder (curved back, flat front), axis along Y
const halfCylinderShell = () => cylinder(0.05, 0.05, D.shinL * 0.7, 14, 0, Math.PI);

// ---- head ------------------------------------------------------------------

function buildHead(neck, c) {
  const head = group(neck, [0, D.neckH / 2 + 0.02, 0]);
  attachMesh(head, mesh(sphere(D.headR, 24, 16)), c("skull"), [0, D.headR * 0.72, 0]);
  // jaw / chin block
  attachMesh(head, mesh(box(0.17, 0.09, 0.17)), c("jaw"), [0, D.headR * 0.20, 0.01]);
  // visor
  attachMesh(head, mesh(box(0.20, 0.055, 0.04)), c("visor"),
    [0, D.headR * 0.78, D.headR * 0.86]);
  // eyes
  for (const x of [-0.055, 0.055])
    attachMesh(head, mesh(sphere(0.019, 12, 8)), c("eye"),
      [x, D.headR * 0.78, D.headR * 0.90]);
  // ear pods
  for (const x of [-1, 1])
    attachMesh(head, place(cylinder(0.045, 0.045, 0.035, 14), { rz: Math.PI / 2 }), c("earPod"),
      [x * D.headR * 0.92, D.headR * 0.72, 0]);
  // antenna: stalk + bulb
  attachMesh(head, mesh(cylinder(0.008, 0.008, 0.11, 8)), c("antenna"),
    [0, D.headR * 1.6, -0.02]);
  attachMesh(head, mesh(sphere(0.022, 12, 8)), c("antennaBulb"),
    [0, D.headR * 1.6 + 0.055, -0.02]);
  return head;
}

// ---- the whole figure ------------------------------------------------------
// Returns { carrier, root, joints }. `carrier` goes into the scene; choreo poses
// `joints` and owns carrier.position.y for the hop.

export function buildRobot(seed = 1) {
  const c = colorMemo(seed);

  const carrier = group(null);
  const root = group(carrier);
  const pelvis = group(root, [0, D.pelvisY, 0]);

  attachMesh(pelvis, mesh(box(...D.pelvis)), c("pelvis"), [0, 0, 0]);
  attachMesh(pelvis, mesh(hemisphere(0.15, 20, 8)), c("pelvisCap"), [0, D.pelvis[1] / 2 - 0.01, 0]);

  const torso = group(pelvis, [0, D.pelvis[1] / 2, 0]);
  attachMesh(torso, mesh(cylinder(D.waistR, D.waistR * 1.15, D.waistH, 16)), c("waist"),
    [0, D.waistH / 2, 0]);
  attachMesh(torso, mesh(box(...D.chest)), c("chest"), [0, D.chestY, 0]);
  // chest plate + core light, so the front is readable from any angle
  attachMesh(torso, mesh(box(0.22, 0.16, 0.03)), c("chestPlate"),
    [0, D.chestY + 0.05, D.chest[2] / 2 + 0.01]);
  attachMesh(torso, place(cylinder(0.045, 0.045, 0.03, 16), { rx: Math.PI / 2 }), c("core"),
    [0, D.chestY - 0.05, D.chest[2] / 2 + 0.015]);
  // back pack
  attachMesh(torso, mesh(box(0.24, 0.20, 0.06)), c("backpack"),
    [0, D.chestY + 0.02, -D.chest[2] / 2 - 0.03]);

  const neck = group(torso, [0, D.chestY + D.chest[1] / 2 - 0.01, 0]);
  attachMesh(neck, mesh(cylinder(D.neckR, D.neckR, D.neckH, 12)), c("neck"), [0, D.neckH / 2, 0]);
  buildHead(neck, c);

  const joints = { pelvis, torso, neck };
  Object.assign(joints, buildArm(torso, +1, c));
  Object.assign(joints, buildArm(torso, -1, c));
  Object.assign(joints, buildLeg(pelvis, +1, c));
  Object.assign(joints, buildLeg(pelvis, -1, c));

  // fail loudly if the tree and the joint list ever drift apart
  for (const j of JOINTS) {
    if (!joints[j]) throw new Error(`rig: joint "${j}" declared in JOINTS but not built`);
  }

  return { carrier, root, joints };
}
