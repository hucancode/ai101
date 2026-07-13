// poses.js — the pose library.
//
// A pose is a plain map  joint -> [x, y, z] Euler angles in DEGREES. Joints left
// out of a pose sit at 0 (the rest pose the rig was built in: standing, arms
// down). Sign conventions, with every limb hanging along -Y at rest:
//
//   shoulder  +x = arm swings BACK,   -x = forward.  +z = left arm lifts OUT
//             (the right arm mirrors: -z lifts it out).
//   elbow     -x = flex (hand comes forward/up).
//   hip       -x = knee drives forward.  ±z = leg spreads out / crosses in.
//   knee      +x = flex (heel toward the hip). Never negative — knees don't
//             bend backwards.
//   ankle     +x = toes up.
//
// Keep leg angles modest: the rig is re-grounded every frame, so a deep bend
// just squats the body rather than floating it, but a wild one would look broken.

import { rad } from "./gfx.js";

export const POSES = {
  stand: {
    shoulderL: [-4, 0, 8], shoulderR: [-4, 0, -8],
    elbowL: [-10, 0, 0], elbowR: [-10, 0, 0],
  },

  tPose: {
    shoulderL: [0, 0, 88], shoulderR: [0, 0, -88],
    elbowL: [-6, 0, 0], elbowR: [-6, 0, 0],
    neck: [0, 0, 0],
  },

  victory: {
    torso: [-6, 0, 0], neck: [-12, 0, 0],
    shoulderL: [-10, 0, 145], shoulderR: [-10, 0, -145],
    elbowL: [-25, 0, 10], elbowR: [-25, 0, -10],
    hipL: [0, 0, 6], hipR: [0, 0, -6],
    kneeL: [8, 0, 0], kneeR: [8, 0, 0],
  },

  hipPopLeft: {
    pelvis: [0, 0, 9], torso: [0, 10, -6], neck: [0, -12, 0],
    shoulderL: [-20, 0, 18], elbowL: [-95, 0, 0], wristL: [0, 0, -20],
    shoulderR: [10, 0, -30], elbowR: [-30, 0, 0],
    hipL: [-4, 0, 4], kneeL: [10, 0, 0],
    hipR: [2, 0, -10], kneeR: [22, 0, 0],
  },

  hipPopRight: {
    pelvis: [0, 0, -9], torso: [0, -10, 6], neck: [0, 12, 0],
    shoulderR: [-20, 0, -18], elbowR: [-95, 0, 0], wristR: [0, 0, 20],
    shoulderL: [10, 0, 30], elbowL: [-30, 0, 0],
    hipR: [-4, 0, -4], kneeR: [10, 0, 0],
    hipL: [2, 0, 10], kneeL: [22, 0, 0],
  },

  pointUpRight: {
    torso: [-4, -16, 4], neck: [-14, 14, 0],
    shoulderR: [-30, 0, -150], elbowR: [-15, 0, 0], wristR: [-10, 0, 0],
    shoulderL: [22, 0, 22], elbowL: [-70, 0, 0],
    hipL: [0, 0, 5], hipR: [0, 0, -3],
    kneeL: [10, 0, 0], kneeR: [16, 0, 0],
  },

  pointDownLeft: {
    torso: [8, 18, -6], neck: [10, -16, 0],
    shoulderL: [-8, 0, 42], elbowL: [-100, 0, 0], wristL: [20, 0, 0],
    shoulderR: [-40, 0, -95], elbowR: [-95, 0, 0],
    hipL: [-8, 0, 8], kneeL: [26, 0, 0],
    hipR: [4, 0, -4], kneeR: [12, 0, 0],
  },

  robotArms: {
    torso: [0, -8, 0], neck: [0, 10, 0],
    shoulderL: [-88, 0, 12], elbowL: [-90, 0, 0], wristL: [0, 0, 0],
    shoulderR: [-15, 0, -12], elbowR: [-95, 0, 0],
    hipL: [0, 0, 4], hipR: [0, 0, -4],
    kneeL: [12, 0, 0], kneeR: [12, 0, 0],
  },

  robotArmsMirror: {
    torso: [0, 8, 0], neck: [0, -10, 0],
    shoulderR: [-88, 0, -12], elbowR: [-90, 0, 0], wristR: [0, 0, 0],
    shoulderL: [-15, 0, 12], elbowL: [-95, 0, 0],
    hipL: [0, 0, 4], hipR: [0, 0, -4],
    kneeL: [12, 0, 0], kneeR: [12, 0, 0],
  },

  crouchCharge: {
    pelvis: [10, 0, 0], torso: [12, 0, 0], neck: [-20, 0, 0],
    shoulderL: [55, 0, 14], elbowL: [-40, 0, 0],
    shoulderR: [55, 0, -14], elbowR: [-40, 0, 0],
    hipL: [-38, 0, 8], hipR: [-38, 0, -8],
    kneeL: [60, 0, 0], kneeR: [60, 0, 0],
    ankleL: [-22, 0, 0], ankleR: [-22, 0, 0],
  },

  strutLeft: {
    pelvis: [0, 12, 0], torso: [-4, -8, 0], neck: [0, -10, 0],
    shoulderL: [-55, 0, 16], elbowL: [-50, 0, 0],
    shoulderR: [45, 0, -16], elbowR: [-25, 0, 0],
    hipL: [-30, 0, 4], kneeL: [40, 0, 0], ankleL: [12, 0, 0],
    hipR: [12, 0, -4], kneeR: [8, 0, 0],
  },

  strutRight: {
    pelvis: [0, -12, 0], torso: [-4, 8, 0], neck: [0, 10, 0],
    shoulderR: [-55, 0, -16], elbowR: [-50, 0, 0],
    shoulderL: [45, 0, 16], elbowL: [-25, 0, 0],
    hipR: [-30, 0, -4], kneeR: [40, 0, 0], ankleR: [-12, 0, 0],
    hipL: [12, 0, 4], kneeL: [8, 0, 0],
  },

  wave: {
    torso: [0, -10, 0], neck: [-6, 8, 0],
    shoulderL: [-10, 0, 118], elbowL: [-60, 0, 0], wristL: [0, 0, -25],
    shoulderR: [8, 0, -14], elbowR: [-18, 0, 0],
    hipL: [0, 0, 4], hipR: [0, 0, -4],
    kneeL: [8, 0, 0], kneeR: [8, 0, 0],
  },

  discoPoint: {
    pelvis: [0, -8, 4], torso: [-8, 10, 0], neck: [-10, -6, 0],
    shoulderL: [-120, 0, 30], elbowL: [-10, 0, 0],
    shoulderR: [40, 0, -25], elbowR: [-40, 0, 0],
    hipL: [-14, 0, 6], kneeL: [24, 0, 0],
    hipR: [8, 0, -8], kneeR: [14, 0, 0],
  },

  bowForward: {
    pelvis: [22, 0, 0], torso: [16, 0, 0], neck: [-18, 0, 0],
    shoulderL: [-30, 0, 55], elbowL: [-30, 0, 0],
    shoulderR: [-30, 0, -55], elbowR: [-30, 0, 0],
    hipL: [-26, 0, 6], hipR: [-26, 0, -6],
    kneeL: [34, 0, 0], kneeR: [34, 0, 0],
  },
};

export const POSE_NAMES = Object.keys(POSES);

// Poses in degrees are what a human writes; the rig wants radians. Bake once.
const _radCache = new Map();
export function poseRad(name) {
  let p = _radCache.get(name);
  if (!p) {
    const src = POSES[name];
    if (!src) throw new Error(`poses: unknown pose "${name}"`);
    p = {};
    for (const [joint, [x, y, z]] of Object.entries(src)) p[joint] = [rad(x), rad(y), rad(z)];
    _radCache.set(name, p);
  }
  return p;
}
