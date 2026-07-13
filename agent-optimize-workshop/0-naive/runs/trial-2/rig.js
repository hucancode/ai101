// rig.js — assembles the machine and maps a pose vector onto its mechanisms.
//
// Layout rule: nothing is placed by eye. A joint is placed once, and the part that
// leaves it takes its cross-section from that joint's `gapInner` (so it turns
// between the cheeks) and its length from the NEXT joint's pivot, stopping exactly
// at that joint's clevis back (`webSpan[0]`). Bend anything and the parts stay
// welded at the pin.
//
// Sides: every channel drives both arms/legs; lateral channels (arm-out, wrist
// tilt/twist) are mirrored by the side sign, the rest are shared.

import { rad, group, colorMemo, groundY } from "./gfx.js";
import { box, piece } from "./primitives.js";
import { hinge, ballSocket, twistCollar, fitBone } from "./joints.js";
import { bone, gripper, foot, headShell, chestShell, pelvisShell } from "./parts.js";

// ---- the machine's dimensions ---------------------------------------------
const D = {
  pelvis: { w: 0.34, h: 0.18, d: 0.24 },
  hip: { x: 0.115, y: -0.115, r: 0.07, gap: 0.09, cheek: 0.02 },
  knee: { r: 0.06, gap: 0.075, cheek: 0.018 },
  thighLen: 0.40,
  shinLen: 0.40,

  ballY: 0.175, ball: 0.085,
  chest: { colH: 0.12, w: 0.40, h: 0.42, d: 0.24 },

  neckY: 0.60, neckR: 0.045, neckH: 0.06,
  headPin: { r: 0.04, gap: 0.044, cheek: 0.012 },
  headR: 0.10,

  shoulder: { x: 0.26, y: 0.45, r: 0.05, gap: 0.055, cheek: 0.016 },
  yokeLen: 0.09,
  pitch: { r: 0.06, gap: 0.07, cheek: 0.018 },
  upperLen: 0.30,
  elbow: { r: 0.055, gap: 0.062, cheek: 0.016 },
  foreLen: 0.235,                       // elbow pin -> twist collar
  wristR: 0.035, wristGap: 0.04, wristCheek: 0.012,
  wristLink: 0.05,                      // tilt pin -> bend pin
};

export function buildRig(scene, seed) {
  const col = colorMemo(seed);
  const root = group(null);
  scene.add(root);

  const n = { arms: [], legs: [], fingers: [] };

  // ---- pelvis + legs -------------------------------------------------------
  const pelvis = group(root, [0, 0, 0]);
  pelvisShell(pelvis, col, { ...D.pelvis, hipX: D.hip.x, hipY: D.hip.y });

  for (const side of [1, -1]) {
    const hipJ = hinge(pelvis, col, {
      origin: [side * D.hip.x, D.hip.y, 0],
      axis: "x", r: D.hip.r, gap: D.hip.gap, cheek: D.hip.cheek, web: "y+",
    });
    const thigh = fitBone(hipJ, D.knee.r * 1.1);
    bone(hipJ.node, col, { len: D.thighLen, ...thigh, nextWeb: D.knee.r * 0.8 });

    const kneeJ = hinge(hipJ.node, col, {
      origin: [0, -D.thighLen, 0],
      axis: "x", r: D.knee.r, gap: D.knee.gap, cheek: D.knee.cheek, web: "y+",
    });
    const shin = fitBone(kneeJ, D.knee.r * 1.15);
    bone(kneeJ.node, col, { len: D.shinLen, ...shin });

    const ankle = group(kneeJ.node, [0, -D.shinLen, 0]);
    foot(ankle, col, { shinW: shin.w });

    n.legs.push({ side, hip: hipJ.node, knee: kneeJ.node });
  }

  // ---- waist: ball in socket ----------------------------------------------
  const waist = ballSocket(pelvis, col, { origin: [0, D.ballY, 0], ball: D.ball });
  n.waist = waist.node;

  const torso = waist.node;
  chestShell(torso, col, { ...D.chest, neckR: D.neckR, exitR: waist.exitR });

  // ---- neck: yaw collar + pitch hinge -------------------------------------
  const yaw = twistCollar(torso, col, { origin: [0, D.neckY, 0], r: D.neckR, h: D.neckH });
  n.headYaw = yaw.node;

  const headJ = hinge(yaw.node, col, {
    origin: [0, D.neckH * 0.75, 0],
    axis: "x", r: D.headPin.r, gap: D.headPin.gap, cheek: D.headPin.cheek, web: "y-",
  });
  n.headPitch = headJ.node;
  headShell(headJ.node, col, { r: D.headR, pinR: D.headPin.r, gapInner: headJ.gapInner });

  // ---- arms ----------------------------------------------------------------
  for (const side of [1, -1]) {
    const sx = side * D.shoulder.x;
    // shoulder mount block: welds the chest to the abduction clevis
    piece(torso, box(0.09, 0.10, 0.12), col, { at: [side * 0.225, D.shoulder.y, 0] });

    // abduction ("arm out"): a clevis whose pin points forward
    const abd = hinge(torso, col, {
      origin: [sx, D.shoulder.y, 0], axis: "z",
      r: D.shoulder.r, gap: D.shoulder.gap, cheek: D.shoulder.cheek,
      web: side > 0 ? "x-" : "x+",          // the clevis back faces the chest
    });
    const yoke = fitBone(abd, D.pitch.r * 1.15);
    bone(abd.node, col, { len: D.yokeLen, ...yoke, nextWeb: D.pitch.r * 0.8 });

    // shoulder proper: pin + clevis, pin pointing out of the shoulder
    const sho = hinge(abd.node, col, {
      origin: [0, -D.yokeLen, 0], axis: "x",
      r: D.pitch.r, gap: D.pitch.gap, cheek: D.pitch.cheek, web: "y+",
    });
    const upper = fitBone(sho, D.elbow.r * 1.1);
    bone(sho.node, col, { len: D.upperLen, ...upper, nextWeb: D.elbow.r * 0.8 });

    const elb = hinge(sho.node, col, {
      origin: [0, -D.upperLen, 0], axis: "x",
      r: D.elbow.r, gap: D.elbow.gap, cheek: D.elbow.cheek, web: "y+",
    });
    const fore = fitBone(elb, D.elbow.r * 1.1);
    bone(elb.node, col, { len: D.foreLen, ...fore });

    // wrist: twist collar, then tilt hinge, then bend hinge
    const tw = twistCollar(elb.node, col, {
      origin: [0, -D.foreLen - D.wristR * 0.4, 0], r: D.wristR, h: D.wristR * 1.4,
    });
    const tilt = hinge(tw.node, col, {
      origin: [0, -D.wristR * 1.3, 0], axis: "z",
      r: D.wristR, gap: D.wristGap, cheek: D.wristCheek, web: "y+",
    });
    const link = fitBone(tilt, D.wristR * 1.1);
    bone(tilt.node, col, { len: D.wristLink, ...link, nextWeb: D.wristR * 0.8 });

    const bend = hinge(tilt.node, col, {
      origin: [0, -D.wristLink, 0], axis: "x",
      r: D.wristR, gap: D.wristGap, cheek: D.wristCheek, web: "y+",
    });
    const fingers = gripper(bend.node, col, { wristR: D.wristR, gapInner: bend.gapInner });

    n.arms.push({
      side, abd: abd.node, sho: sho.node, elb: elb.node,
      twist: tw.node, tilt: tilt.node, bend: bend.node, fingers,
    });
  }

  groundY(root); // soles on y = 0

  // ---- pose -> mechanism ---------------------------------------------------
  // sign conventions, all in degrees:
  //   headPitch +  = look up      waistBend +  = lean forward
  //   shoulder  +  = arm forward  elbow     +  = forearm folds forward
  //   armOut    +  = arm away from the body (mirrored)
  //   hip       +  = thigh forward  knee +  = heel back  (legs: hand-driven only)
  function applyPose(p) {
    n.headYaw.rotation.y = rad(p.headYaw);
    n.headPitch.rotation.x = rad(-p.headPitch);
    n.waist.rotation.set(rad(p.waistBend), rad(p.waistTwist), rad(p.waistTilt)); // YXZ

    for (const a of n.arms) {
      a.abd.rotation.z = rad(p.armOut) * a.side;
      a.sho.rotation.x = rad(-p.shoulder);
      a.elb.rotation.x = rad(-p.elbow);
      a.twist.rotation.y = rad(p.wristTwist) * a.side;
      a.tilt.rotation.z = rad(p.wristTilt) * a.side;
      a.bend.rotation.x = rad(-p.wristBend);
      for (const f of a.fingers) {
        f.base.rotation.x = rad(p.fingerCurl) * f.dir;
        f.mid.rotation.x = rad(p.fingerCurl * 0.9) * f.dir;
      }
    }
    for (const l of n.legs) {
      l.hip.rotation.x = rad(-p.hip);
      l.knee.rotation.x = rad(p.knee);
    }
  }

  return { root, applyPose, nodes: n };
}
