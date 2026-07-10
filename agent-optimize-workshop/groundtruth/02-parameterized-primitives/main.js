import { createViewer, createDrawer } from "./render.js";
import * as P from "./primitives.js";

// Interactive parameter inspector: pick a builder, drag its params, watch the
// mesh and the handle's id (shape identity including size) update live.

// param spec per builder: [min, max, step, initial], or [[options], initial]
// for an enum
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
  boxCylinder: { fn: P.boxCylinder, args: ["w", "boxH", "d", "cylH", "fit", "seg"],
    p: { w: [0.2, 2, 0.05, 1], boxH: [0.1, 1.5, 0.05, 0.5], d: [0.2, 2, 0.05, 1], cylH: [0.05, 1.5, 0.02, 0.8], fit: [["in", "out"], "in"], seg: [3, 48, 1, 24] } },
  // teeth counts under 3 leave that rim flat; tooth depth and hole radius are
  // fixed fractions of r, so the two counts are the whole shape identity
  gear: { fn: P.gear, args: ["r", "h", "teethOut", "teethIn"],
    p: { r: [0.1, 1, 0.02, 0.6], h: [0.05, 1, 0.02, 0.25], teethOut: [0, 24, 1, 12], teethIn: [0, 24, 1, 0] } },
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
  for (const [k, def] of Object.entries(spec.p)) {
    values[k] = Array.isArray(def[0]) ? def[1] : def[3];
    const row = document.createElement("label");
    if (Array.isArray(def[0])) {                     // enum
      const s = document.createElement("select");
      for (const opt of def[0]) { const o = document.createElement("option"); o.value = o.textContent = opt; s.appendChild(o); }
      s.value = def[1];
      s.addEventListener("change", () => { values[k] = s.value; });
      row.append(`${k} `, s);
    } else {
      const [min, max, step, init] = def;
      const s = document.createElement("input");
      s.type = "range"; s.min = min; s.max = max; s.step = step; s.value = init;
      const v = document.createElement("span");
      v.textContent = init;
      s.addEventListener("input", () => { values[k] = +s.value; v.textContent = s.value; });
      row.append(`${k} `, s, v);
    }
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
