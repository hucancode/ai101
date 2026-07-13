import { createViewer, createDrawer } from "./render.js";
import { atlasModel, CHANNEL_DEPTH } from "./rig.js";

const SEED = 3;
const viewer = createViewer(document.getElementById("view"), { camDist: 3, camHeight: 0.25, target: [0, 0.35, 0] });
const drawer = createDrawer(viewer.scene);

// Idle sway: every pose channel gets its own small oscillation, phase-shifted
// by its bone depth (published by rig.js) so motion ripples outward from the
// root instead of every joint snapping in lockstep — nobody here hand-keeps
// a list of which joints are root-near.
const AMPLITUDE = {
  headYaw: 6, headPitch: 4, twist: 5, waistBend: 4, waistTilt: 3,
  shoulder: 8, armOut: 14, elbow: 12, wristBend: 8, wristTilt: 6, wristTwist: 10,
  curl: 14, hip: 7, knee: 9,
};
const SPEED = {
  headYaw: 0.6, headPitch: 0.7, twist: 0.5, waistBend: 0.45, waistTilt: 0.5,
  shoulder: 0.55, armOut: 0.8, elbow: 0.9, wristBend: 1.1, wristTilt: 1.2, wristTwist: 1.0,
  curl: 1.3, hip: 0.5, knee: 0.7,
};

viewer.onFrame = (t) => {
  const pose = {};
  for (const ch of Object.keys(AMPLITUDE)) {
    const phase = CHANNEL_DEPTH[ch] * 0.4;
    pose[ch] = AMPLITUDE[ch] * Math.sin(t * SPEED[ch] + phase);
  }
  const { items } = atlasModel(SEED, pose);
  drawer.draw(items);
};
