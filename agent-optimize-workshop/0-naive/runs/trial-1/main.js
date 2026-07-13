// main.js — wiring. Viewer + rig + choreography + panel.
//
// Modules:  prims.js  (primitive surfaces, pure math)
//           mesh.js   (the only Mesh factory; reaches Three via gfx)
//           rig.js    (the robot's joint tree)
//           poses.js  (the pose library)
//           choreo.js (beat clock, blending, grounding)
//           ui.js     (the panel)

import { createViewer } from "./gfx.js";
import { buildRobot } from "./rig.js";
import { createChoreo } from "./choreo.js";
import { primStats } from "./prims.js";
import { POSE_NAMES } from "./poses.js";
import { slider, toggle, button, readout, title } from "./ui.js";

const canvas = document.getElementById("view");
const params = document.getElementById("params");

// framed on the standing figure: eye-level-ish, close enough that a 1.9 m robot
// fills the frame, far enough that a wide pose does not clip out of it
const viewer = createViewer(canvas, { camDist: 3.4, camHeight: 0.3, target: [0, 0.95, 0] });

// ---- the figure ------------------------------------------------------------

const state = { seed: 7, bpm: 60, energy: 1, paused: false };

let rig = null;
let choreo = null;

function rebuild() {
  if (rig) viewer.scene.remove(rig.carrier);
  rig = buildRobot(state.seed);
  viewer.scene.add(rig.carrier);
  choreo = createChoreo(rig, { ...state });
}
rebuild();

// ---- panel -----------------------------------------------------------------

title(params, "ATLAS");

slider(params, {
  label: "bpm", min: 30, max: 180, step: 1, value: state.bpm,
  onInput: (v) => (state.bpm = choreo.cfg.bpm = v),
});
slider(params, {
  label: "energy", min: 0, max: 2, step: 0.05, value: state.energy,
  format: (v) => v.toFixed(2),
  onInput: (v) => (state.energy = choreo.cfg.energy = v),
});
slider(params, {
  label: "seed", min: 1, max: 64, step: 1, value: state.seed,
  onInput: (v) => { state.seed = v; rebuild(); },   // seed = identity: colours + routine
});
toggle(params, {
  label: "paused", value: state.paused,
  onChange: (v) => (state.paused = choreo.cfg.paused = v),
});
button(params, { label: "reseed", onClick: () => { state.seed = 1 + ((state.seed * 7 + 3) % 64); rebuild(); } });

const poseOut = readout(params, "pose");
const beatOut = readout(params, "beat");
const statsOut = readout(params, "shapes");

const stats = primStats();
statsOut.set(`${stats.shapes} / ${stats.triangles} tris`);

// ---- frame -----------------------------------------------------------------

viewer.onFrame = (t) => {
  choreo.update(t);
  poseOut.set(choreo.pose);
  beatOut.set(String(choreo.beat));
};

console.log(
  `atlas: ${POSE_NAMES.length} poses, ${stats.shapes} distinct shapes, ${stats.triangles} triangles`,
);
