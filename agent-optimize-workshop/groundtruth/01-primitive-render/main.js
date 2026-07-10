import { TAU } from "./math.js";
import { createViewer, createDrawer } from "./render.js";
import { genBox, genConeCut, genLathe, cylBody } from "./primitives.js";

// generate one soup per shape, place one of each in a row
const soups = [
  genBox(0, 0),
  genBox(0.5, 0),
  genBox(0.5, 1),
  cylBody(0.5, 1, 24, 0, TAU),
  genConeCut(0, 24),
  genConeCut(0.4, 24),
  genLathe(24, 16, Math.PI, false),
  genLathe(24, 8, Math.PI / 2, true),
];

const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const COLORS = [
  [0.90, 0.36, 0.33], [0.95, 0.62, 0.25], [0.93, 0.85, 0.35], [0.45, 0.80, 0.42],
  [0.36, 0.72, 0.86], [0.42, 0.50, 0.90], [0.72, 0.48, 0.88], [0.88, 0.50, 0.72],
];
const items = soups.map((g, i) => ({
  mesh: { positions: new Float32Array(g.positions), normals: new Float32Array(g.normals) },
  m: I3.slice(),
  t: [(i - (soups.length - 1) / 2) * 1.6, 0.6, 0],
  color: COLORS[i % COLORS.length],
}));

const viewer = createViewer(document.getElementById("view"), { camDist: 9, camHeight: 1 });
const drawer = createDrawer(viewer.scene);
viewer.onFrame = () => drawer.draw(items);
