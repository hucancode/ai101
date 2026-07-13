// pose.js — the pose vector: one channel per DOF, in DEGREES.
//
// One channel drives BOTH sides of the body (the rig mirrors it). This object is the
// single source of truth: the sliders are bound to it and the choreographer writes
// into it, so neither can get out of step with the other.
//
// Ranges are not decoration: a pin-and-clevis hinge jams its child rod into the
// clevis back past ~120 deg (see HINGE_LIMIT in joints.js), so no hinge channel may
// exceed that, and the waist is held to +-45 in bend/tilt so the chest clears the
// pelvis rim.

export const CHANNELS = [
  { key: "headYaw", label: "head yaw", min: -90, max: 90 },
  { key: "headPitch", label: "head pitch", min: -45, max: 45 },
  { key: "waistTwist", label: "waist twist", min: -90, max: 90 },
  { key: "waistBend", label: "waist bend", min: -45, max: 45 },
  { key: "waistTilt", label: "waist tilt", min: -45, max: 45 },
  { key: "shoulder", label: "shoulder", min: -120, max: 120 },
  { key: "armOut", label: "arm out", min: 0, max: 120, rest: 8 },
  { key: "elbow", label: "elbow", min: 0, max: 120 },
  { key: "wristBend", label: "wrist bend", min: -90, max: 90 },
  { key: "wristTilt", label: "wrist tilt", min: -45, max: 45 },
  { key: "wristTwist", label: "wrist twist", min: -90, max: 90 },
  { key: "fingerCurl", label: "finger curl", min: 0, max: 90, rest: 10 },
  { key: "hip", label: "hip", min: -90, max: 90, leg: true },
  { key: "knee", label: "knee", min: 0, max: 120, leg: true },
];

export const CHANNEL_BY_KEY = new Map(CHANNELS.map((c) => [c.key, c]));

export const restPose = () => {
  const p = {};
  for (const c of CHANNELS) p[c.key] = c.rest ?? 0;
  return p;
};

export const clampChannel = (key, v) => {
  const c = CHANNEL_BY_KEY.get(key);
  if (!c) throw new Error(`unknown pose channel "${key}"`);
  return Math.min(c.max, Math.max(c.min, v));
};

// Every multiple of 45 deg inside a channel's range — the machine-square targets.
export const gridOf = (key) => {
  const c = CHANNEL_BY_KEY.get(key);
  if (!c) throw new Error(`unknown pose channel "${key}"`);
  const out = [];
  const first = Math.ceil(c.min / 45), last = Math.floor(c.max / 45);
  for (let k = first; k <= last; k++) out.push(k * 45);
  if (!out.length) throw new Error(`channel "${key}" has no 45-degree grid point`);
  return out;
};
