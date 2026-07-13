// Interactive parameter inspector: pick a builder, one slider per parameter,
// live readout of the handle's id, the shape colored by that id.
import { createViewer, createDrawer } from "./render.js";
import * as P from "./primitives.js";

// param schema per builder: [name, min, max, step, default]
const SCHEMA = {
  box: [
    ["w", 0.2, 3, 0.05, 1], ["h", 0.2, 3, 0.05, 1], ["d", 0.2, 3, 0.05, 1],
    ["slope", 0, 1, 0.01, 0.3], ["curve", -1, 1, 0.01, 0],
  ],
  cylinder: [["r", 0.1, 2, 0.05, 0.5], ["h", 0.1, 3, 0.05, 1], ["seg", 3, 48, 1, 16]],
  coneCut: [["r0", 0.1, 2, 0.05, 0.5], ["r1", 0.1, 2, 0.05, 0.25], ["h", 0.1, 3, 0.05, 1], ["seg", 3, 48, 1, 16]],
  sphere: [["r", 0.1, 2, 0.05, 0.5], ["seg", 3, 48, 1, 16], ["rings", 2, 32, 1, 12]],
  hemisphere: [["r", 0.1, 2, 0.05, 0.5], ["seg", 3, 48, 1, 16], ["rings", 2, 24, 1, 8]],
  cutHemisphere: [
    ["r", 0.1, 2, 0.05, 0.5], ["t", 0.02, 0.45, 0.01, 0.15], ["cut", 0.05, 0.95, 0.01, 0.6],
    ["seg", 3, 48, 1, 16], ["rings", 2, 24, 1, 8],
  ],
  halfCylinder: [["r", 0.1, 2, 0.05, 0.5], ["h", 0.1, 3, 0.05, 1], ["seg", 3, 48, 1, 16]],
  halfCylinderBox: [["r", 0.1, 2, 0.05, 0.5], ["h", 0.05, 2, 0.05, 0.6], ["depth", 0.1, 3, 0.05, 1], ["seg", 3, 48, 1, 16]],
};

const BUILDERS = {
  box: (p) => P.box(p.w, p.h, p.d, p.slope, p.curve),
  cylinder: (p) => P.cylinder(p.r, p.h, p.seg),
  coneCut: (p) => P.coneCut(p.r0, p.r1, p.h, p.seg),
  sphere: (p) => P.sphere(p.r, p.seg, p.rings),
  hemisphere: (p) => P.hemisphere(p.r, p.seg, p.rings),
  cutHemisphere: (p) => P.cutHemisphere(p.r, p.t, p.cut, p.seg, p.rings),
  halfCylinder: (p) => P.halfCylinder(p.r, p.h, p.seg),
  halfCylinderBox: (p) => P.halfCylinderBox(p.r, p.h, p.depth, p.seg),
};

const canvas = document.getElementById("view");
const viewer = createViewer(canvas, { camDist: 4, camHeight: 0.6 });
const drawer = createDrawer(viewer.scene);

const builderSel = document.getElementById("builder");
const slidersEl = document.getElementById("sliders");
const idOut = document.getElementById("idOut");
const keyOut = document.getElementById("keyOut");

let params = {};
let seed = 1;

for (const name of Object.keys(SCHEMA)) {
  const opt = document.createElement("option");
  opt.value = name;
  opt.textContent = name;
  builderSel.appendChild(opt);
}

function resetParams(name) {
  params = {};
  for (const [p, , , , def] of SCHEMA[name]) params[p] = def;
}

function buildSliders(name) {
  slidersEl.innerHTML = "";
  for (const [p, min, max, step, def] of SCHEMA[name]) {
    const row = document.createElement("label");
    row.className = "row";
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = p;
    const val = document.createElement("span");
    val.className = "val";
    val.textContent = def;
    const input = document.createElement("input");
    input.type = "range";
    input.min = min; input.max = max; input.step = step; input.value = def;
    input.addEventListener("input", () => {
      params[p] = parseFloat(input.value);
      val.textContent = input.value;
      render();
    });
    row.append(tag, input, val);
    slidersEl.appendChild(row);
  }
}

function render() {
  const name = builderSel.value;
  const { items } = P.collect(BUILDERS[name], seed, params);
  drawer.draw(items);
  idOut.textContent = items[0].id;
  keyOut.textContent = items[0].key;
}

builderSel.addEventListener("change", () => {
  resetParams(builderSel.value);
  buildSliders(builderSel.value);
  render();
});

document.getElementById("reseed").addEventListener("click", () => {
  seed = (seed * 2654435761 + 1) >>> 0;
  render();
});

builderSel.value = "box";
resetParams("box");
buildSliders("box");
render();
