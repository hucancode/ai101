// ATLAS — the page. The rig assembles ONCE into a posable node tree; the frame loop
// only sets bone angles.
//
// The choreographer drives the mech. It never sees hip/knee — the legs hold the mech
// up, so they are HAND-ONLY. A drag writes straight into the pose object the beat
// mutates, so releasing the slider HANDS CONTROL BACK: the next beat starts from
// wherever the hand left it.
import { createViewer } from "./gfx.js";
import { createChoreographer } from "./engines/choreo.js";
import { buildAtlas, CHANNELS, HAND_ONLY } from "./rig.js";

const atlas = buildAtlas();

const viewer = createViewer(document.getElementById("view"),
  { camDist: 4.2, camHeight: 0.4, target: [0, 1.2, 0] });
viewer.scene.add(atlas.root);

// ---- the choreographer — every channel the hands do not own --------------------
const driven = Object.entries(CHANNELS)
  .filter(([key]) => !HAND_ONLY.has(key))
  .map(([key, [min, max]]) => ({ key, min, max }));
const choreo = createChoreographer(driven, { home: atlas.pose, seed: 7 });

// ---- sliders — every channel is draggable --------------------------------------
const panel = document.getElementById("params");
const rows = [];
let dragging = 0;

for (const [key, [min, max]] of Object.entries(CHANNELS)) {
  const row = document.createElement("label");
  if (HAND_ONLY.has(key)) row.className = "hand";
  const input = document.createElement("input");
  input.type = "range";
  input.min = min; input.max = max; input.step = 1; input.value = 0;
  const val = document.createElement("span");
  val.textContent = "0";
  // a drag owns the channel while the pointer is down, then hands it back
  input.addEventListener("pointerdown", () => dragging++);
  const release = () => { if (dragging) dragging--; };
  input.addEventListener("pointerup", release);
  input.addEventListener("pointercancel", release);
  input.addEventListener("input", () => { atlas.pose[key] = +input.value; });
  row.append(`${key} `, input, val);
  panel.appendChild(row);
  rows.push({ key, input, val });
}

document.getElementById("caption").textContent =
  `${Object.keys(CHANNELS).length} channels, ${driven.length} of them choreographed; ` +
  `hip and knee are hand-only. Drag any slider — the next beat picks up from there.`;

// ---- the loop — angles only. Nothing is rebuilt per frame. ---------------------
let last = 0;
viewer.onFrame = (t) => {
  const dt = Math.min(0.05, t - last);            // a tab-switch must not skip a beat
  last = t;
  if (!dragging) choreo.step(dt, atlas.pose);
  atlas.setPose(atlas.pose);
  for (const r of rows) {
    const v = atlas.pose[r.key];
    if (+r.input.value !== v) r.input.value = v;
    r.val.textContent = v.toFixed(0);
  }
};
