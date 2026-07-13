// 04 — the atlas rig driven by the choreographer, with a manual override
// panel: one range input per pose channel, two-way bound to the pose object.
import { createViewer, createDrawer } from "./render.js";
import { atlasModel, atlasHeight, ATLAS_POSE, ATLAS_POSE_DEPTH } from "./rig.js";
import { createChoreographer } from "./choreo.js";

const SEED = 1;

// The rig owns no notion of a slider's legal range — only the pose channels
// and their bone depth (ATLAS_POSE_DEPTH). The demo, which owns the pose
// object, picks physically sane ranges (degrees) per channel.
const RANGES = {
  headYaw: [-60, 60], headPitch: [-35, 30], twist: [-45, 45],
  waistBend: [-25, 30], waistTilt: [-20, 20],
  shoulder: [-90, 140], armOut: [0, 130],
  elbow: [0, 150],
  wristBend: [-70, 70], wristTilt: [-45, 45], wristTwist: [-90, 90],
  curl: [0, 90],
  hip: [-70, 100], knee: [0, 130],
};

// big = root-near bone: below-average channel depth, read off the rig's own
// published ATLAS_POSE_DEPTH rather than a hand-kept list of channel names.
const depths = Object.values(ATLAS_POSE_DEPTH);
const avgDepth = depths.reduce((a, b) => a + b, 0) / depths.length;
const sliders = Object.keys(ATLAS_POSE).map((key) => {
  const [min, max] = RANGES[key];
  return { key, min, max, big: ATLAS_POSE_DEPTH[key] <= avgDepth };
});

// the pose object: owned here, mutated in place by both the choreographer
// and the range inputs, and fed to atlasModel every frame.
const pose = { ...ATLAS_POSE };

const choreo = createChoreographer(sliders, { home: { ...ATLAS_POSE }, seed: SEED });

// panel: one range input per pose channel, two-way bound to `pose`.
const panel = document.getElementById("panel");
const inputs = {};
const readouts = {};
for (const s of sliders) {
  const row = document.createElement("label");
  row.className = "row";

  const name = document.createElement("span");
  name.className = "name";
  name.textContent = s.key;

  const readout = document.createElement("span");
  readout.className = "val";
  readouts[s.key] = readout;

  const input = document.createElement("input");
  input.type = "range";
  input.min = s.min;
  input.max = s.max;
  input.step = 0.1;
  input.value = pose[s.key];
  // dragging writes straight into the shared pose object — the choreographer
  // notices its own last-written value no longer matches and hands control
  // of this channel back for the rest of the current beat.
  input.addEventListener("input", () => { pose[s.key] = parseFloat(input.value); });
  inputs[s.key] = input;

  row.append(name, input, readout);
  panel.appendChild(row);
}

const viewer = createViewer(document.getElementById("view"), {
  camDist: 7, camHeight: 0.5, target: [0, atlasHeight(SEED) / 2, 0],
});
const drawer = createDrawer(viewer.scene);

// a backgrounded tab pauses rAF; on return, `t` jumps by however long it was
// away. Clamp dt so the choreographer catches up smoothly instead of a whole
// beat vanishing in one step.
const MAX_DT = 0.1;
let lastT = null;

viewer.onFrame = (t) => {
  const dt = lastT === null ? 0 : Math.min(t - lastT, MAX_DT);
  lastT = t;

  choreo.step(dt, pose);

  for (const s of sliders) {
    inputs[s.key].value = pose[s.key];
    readouts[s.key].textContent = pose[s.key].toFixed(1);
  }

  drawer.draw(atlasModel(SEED, pose).items);
};
