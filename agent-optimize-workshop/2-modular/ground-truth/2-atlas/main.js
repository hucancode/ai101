import { createViewer } from "./gfx.js";
import { createAtlasRig, ATLAS_POSE, RANGES, LEGS } from "./robot/atlas.js";
import { createChoreographer } from "./engines/choreo.js";

// The choreographer drives the rig's POSE SLIDERS, not the geometry: every beat
// it writes new values into the same object the sliders are bound to, so the
// panel tracks the motion and a drag hands control straight back.
const SEED = 1;

// every channel except the legs is a slider the choreographer may drive
const KEYS = Object.keys(RANGES);
const sliders = KEYS.filter((key) => !LEGS.includes(key)).map((key) => ({
  key, min: RANGES[key][0], max: RANGES[key][1],
}));

const home = Object.fromEntries(KEYS.map((k) => [k, 0]));
const pose = { ...ATLAS_POSE };
const choreo = createChoreographer(sliders, { home, seed: SEED });

// ---- panel: one range input per channel, two-way bound to `pose` ------------
const panel = document.getElementById("params");
const rows = KEYS.map((key) => {
  const row = document.createElement("label");
  const input = document.createElement("input");
  input.type = "range";
  input.min = RANGES[key][0]; input.max = RANGES[key][1]; input.step = 1;
  input.value = pose[key];
  const val = document.createElement("span");
  input.addEventListener("input", () => { pose[key] = +input.value; });
  row.append(`${key} `, input, val);
  panel.appendChild(row);
  return { key, input, val };
});

const viewer = createViewer(document.getElementById("view"), { camDist: 7, camHeight: 0.5, target: [0, 1.8, 0] });

// build the rig ONCE and add its root to the scene; each frame just re-poses the
// bone nodes. Three composes the world transforms and renders the graph.
const rig = createAtlasRig(SEED);
viewer.scene.add(rig.root);

let last = 0;
viewer.onFrame = (t) => {
  const dt = Math.min(0.1, t - last);   // clamp: a backgrounded tab must not skip a whole beat
  last = t;
  choreo.step(dt, pose);
  for (const r of rows) {
    r.input.value = pose[r.key];
    r.val.textContent = pose[r.key].toFixed(0);
  }
  rig.pose(pose);
};
