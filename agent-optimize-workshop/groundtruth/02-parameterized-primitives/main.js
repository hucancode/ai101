import { createViewer, createDrawer } from "./render.js";
import * as P from "./primitives.js";

// Interactive parameter inspector: pick a builder, drag its params, watch the
// mesh and the handle's id (shape identity including size) update live.

// param spec per builder: [min, max, step, initial]
const SPECS = {
  box: { fn: P.box, args: ["w", "h", "d", "slope", "curve"],
    p: { w: [0.2, 2, 0.05, 1], h: [0.2, 2, 0.05, 1], d: [0.2, 2, 0.05, 1], slope: [0, 1, 0.01, 0], curve: [-1, 1, 0.01, 0] } },
  cylinder: { fn: P.cylinder, args: ["r", "h", "seg"],
    p: { r: [0.1, 1, 0.02, 0.5], h: [0.2, 2, 0.05, 1], seg: [3, 48, 1, 24] } },
  cone: { fn: P.cone, args: ["r", "h", "seg"],
    p: { r: [0.1, 1, 0.02, 0.5], h: [0.2, 2, 0.05, 1], seg: [3, 48, 1, 24] } },
  coneCut: { fn: P.coneCut, args: ["r0", "r1", "h", "seg"],
    p: { r0: [0.1, 1, 0.02, 0.5], r1: [0, 1, 0.02, 0.25], h: [0.2, 2, 0.05, 1], seg: [3, 48, 1, 24] } },
  sphere: { fn: P.sphere, args: ["r", "seg", "rings"],
    p: { r: [0.1, 1, 0.02, 0.5], seg: [3, 48, 1, 24], rings: [2, 32, 1, 16] } },
  hemisphere: { fn: P.hemisphere, args: ["r", "seg", "rings"],
    p: { r: [0.1, 1, 0.02, 0.5], seg: [3, 48, 1, 24], rings: [2, 32, 1, 8] } },
  cutHemisphere: { fn: P.cutHemisphere, args: ["r", "t", "cut", "seg", "rings"],
    p: { r: [0.1, 1, 0.02, 0.5], t: [0.02, 0.95, 0.01, 0.25], cut: [0, 0.98, 0.01, 0.7], seg: [3, 48, 1, 24], rings: [2, 16, 1, 6] } },
  halfCylinder: { fn: P.halfCylinder, args: ["r", "h", "seg"],
    p: { r: [0.1, 1, 0.02, 0.5], h: [0.2, 2, 0.05, 1], seg: [3, 32, 1, 12] } },
  halfCylinderBox: { fn: P.halfCylinderBox, args: ["r", "h", "depth", "seg"],
    p: { r: [0.1, 1, 0.02, 0.5], h: [0.2, 2, 0.05, 1], depth: [0.05, 1.5, 0.02, 0.5], seg: [3, 32, 1, 12] } },
  quarterCylinder: { fn: P.quarterCylinder, args: ["r", "h", "seg"],
    p: { r: [0.1, 1.2, 0.02, 0.5], h: [0.05, 1, 0.02, 0.3], seg: [2, 24, 1, 8] } },
};

let current = "box";
const values = {};                                   // live params of `current`

const sel = document.getElementById("prim");
const panel = document.getElementById("params");
const idEl = document.getElementById("id");

for (const name of Object.keys(SPECS)) {
  const o = document.createElement("option");
  o.value = o.textContent = name;
  sel.appendChild(o);
}
sel.value = current;
sel.addEventListener("change", () => { current = sel.value; buildPanel(); });

function buildPanel() {
  const spec = SPECS[current];
  panel.innerHTML = "";
  for (const [k, [min, max, step, init]] of Object.entries(spec.p)) {
    values[k] = init;
    const row = document.createElement("label");
    const s = document.createElement("input");
    s.type = "range"; s.min = min; s.max = max; s.step = step; s.value = init;
    const v = document.createElement("span");
    v.textContent = init;
    s.addEventListener("input", () => { values[k] = +s.value; v.textContent = s.value; });
    row.append(`${k} `, s, v);
    panel.appendChild(row);
  }
}
buildPanel();

const viewer = createViewer(document.getElementById("view"), { camDist: 4, camHeight: 0.6, target: [0, 0.5, 0] });
const drawer = createDrawer(viewer.scene);

viewer.onFrame = () => {
  const spec = SPECS[current];
  const h = spec.fn(...spec.args.map((k) => values[k]));
  idEl.textContent = h.id;
  const it = P.bake(P.translate(h, 0, 0.5, 0));
  it.color = [0.55, 0.75, 0.9];
  drawer.draw([it]);
};
