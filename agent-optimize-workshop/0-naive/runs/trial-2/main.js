// main.js — wire it up: one pose object, one rig, one choreographer, one panel.
//
//   choreo.update(t) --writes--> pose <--writes-- slider drag
//                                 |
//                                 +--> rig.applyPose()  and  panel sync()
//
// Everything reproducible: SEED fixes the colours AND the dance.

import { createViewer } from "./gfx.js";
import { restPose } from "./pose.js";
import { buildRig } from "./rig.js";
import { createChoreographer } from "./choreo.js";
import { buildPanel } from "./ui.js";

const SEED = 20260711;

const canvas = document.getElementById("view");
if (!canvas) throw new Error("main: #view canvas missing from the page");

const viewer = createViewer(canvas, { camDist: 4.2, camHeight: 0, target: [0, 1.05, 0] });

const pose = restPose();
const rig = buildRig(viewer.scene, SEED);
const choreo = createChoreographer(pose, SEED);
const syncPanel = buildPanel(document.getElementById("params"), pose, {
  onGrab: (key) => choreo.release(key),
});

rig.applyPose(pose);
syncPanel();

viewer.onFrame = (t) => {
  choreo.update(t);
  rig.applyPose(pose);
  syncPanel();
};

// a hook for headless checks: window.__atlas.pose / .rig
window.__atlas = { pose, rig, choreo, seed: SEED };
