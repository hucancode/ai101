import { createViewer, createDrawer } from "./render.js";
import { atlasModel, ATLAS_POSE, ATLAS_POSE_DEPTH } from "./rig.js";
import { createChoreographer } from "./choreo.js";

// The choreographer drives the rig's POSE SLIDERS, not the geometry: every
// beat it writes new values into the same object the sliders are bound to, so
// the panel tracks the motion and a drag hands control straight back.
const SEED = 1;

// slider ranges, degrees. `big` = a root-near bone (the main move of a beat);
// the rest are leaf-near and only ever play anticipation ramps.
const RANGES = {
  headYaw: [-60, 60], headPitch: [-30, 30],
  twist: [-45, 45], waistBend: [-30, 30], waistTilt: [-20, 20],
  shoulder: [-60, 120], armOut: [0, 120], elbow: [0, 120],
  wristBend: [-60, 60], wristTilt: [-45, 45], wristTwist: [-90, 90],
  curl: [0, 90], hip: [-45, 60], knee: [0, 90],
};

// a channel's depth IS the depth of the link it turns (rig.js derives it from
// the skeleton), so "big" needs no hand-kept list of joint names
const KEYS = Object.keys(RANGES);
const sliders = KEYS.map((key) => ({
  key, min: RANGES[key][0], max: RANGES[key][1], big: ATLAS_POSE_DEPTH[key] <= 2,
}));

// channels sharing one joint pick their targets independently; three at full
// swing would fold the part through itself, so cap what each group may spend
const budgets = [
  { keys: ["twist", "waistBend", "waistTilt"], limit: 60 },
  { keys: ["wristBend", "wristTilt", "wristTwist"], limit: 120 },
];

const home = Object.fromEntries(KEYS.map((k) => [k, 0]));
const pose = { ...ATLAS_POSE };
const choreo = createChoreographer(sliders, { home, budgets, seed: SEED });

// ---- panel: one range input per channel, two-way bound to `pose` ------------
const panel = document.getElementById("params");
const rows = KEYS.map((key) => {
  const row = document.createElement("label");
  const input = document.createElement("input");
  input.type = "range";
  input.min = RANGES[key][0]; input.max = RANGES[key][1]; input.step = 1;
  input.value = pose[key];
  const val = document.createElement("span");
  // a drag writes straight into the pose; the next beat plans from wherever
  // the user left it, so the choreographer and the hand never fight
  input.addEventListener("input", () => { pose[key] = +input.value; });
  row.append(`${key} `, input, val);
  panel.appendChild(row);
  return { key, input, val };
});

const viewer = createViewer(document.getElementById("view"), { camDist: 7, camHeight: 0.5, target: [0, 1.8, 0] });
const drawer = createDrawer(viewer.scene);

let last = 0;
viewer.onFrame = (t) => {
  const dt = Math.min(0.1, t - last);   // clamp: a backgrounded tab must not skip a whole beat
  last = t;
  choreo.step(dt, pose);
  for (const r of rows) {
    r.input.value = pose[r.key];
    r.val.textContent = pose[r.key].toFixed(0);
  }
  drawer.draw(atlasModel(SEED, pose).items);
};
