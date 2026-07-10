import { createViewer, createDrawer } from "./render.js";
import { atlasModel } from "./rig.js";
import { assembleModel } from "./assembly.js";

// the atlas builds itself: u = build progress 0..1. Auto-loops; drag the
// slider to scrub (determinism: same u always shows the exact same state).
const SEED = 1;

// static body: one fixed pose, one item list reused every frame (its identity
// also keys assembly's internal pose caches)
const { items } = atlasModel(SEED, {});

const slider = document.getElementById("u");
const label = document.getElementById("uv");
let auto = true;
let u = 0;
slider.addEventListener("input", () => { auto = false; u = +slider.value; });
document.getElementById("play").addEventListener("click", () => { auto = true; });

const CYCLE = 14;   // seconds per build, then a 2s hold
const viewer = createViewer(document.getElementById("view"), { camDist: 9, camHeight: 0.5, target: [0, 1.8, 0] });
const drawer = createDrawer(viewer.scene);

viewer.onFrame = (t) => {
  if (auto) {
    const c = (t % (CYCLE + 2)) / CYCLE;
    u = Math.min(1, c);
    slider.value = u;
  }
  label.textContent = u.toFixed(3);
  drawer.draw(assembleModel(items, u));
};
