// Animated gallery: the 3 catalog joints side by side, every pose axis
// sweeping continuously. Disc bases are turned on wherever a joint has the
// option, so the spins read. The mount-to-mount hinge is exported for
// consumers but is not a catalog entry and does not appear here.
import { createViewer, createDrawer } from "./render.js";
import * as J from "./joints.js";

const canvas = document.getElementById("view");
const viewer = createViewer(canvas, { camDist: 5.2, camHeight: 0.35, target: [0, 0, 0] });
const drawer = createDrawer(viewer.scene);

const SPACING = 2.3;
const SEED = 7;
const DISC = { femaleBase: "disc", maleBase: "disc" };

const entries = [
  { x: -SPACING, build: (t) => J.catalogHinge1(SEED, DISC, { swing: Math.sin(t * 0.9) * 1.15 }) },
  { x: 0, build: (t) => J.catalogHinge2(SEED, DISC, { rx: Math.sin(t * 0.7) * 0.95, rz: Math.sin(t * 1.15 + 1.0) * 0.95 }) },
  { x: SPACING, build: (t) => J.catalogBall1(SEED, {}, { rx: Math.sin(t * 0.6) * 0.55, ry: t * 0.8, rz: Math.sin(t * 0.85 + 2.1) * 0.55 }) },
];

viewer.onFrame = (t) => {
  const items = [];
  for (const e of entries) {
    const { items: its } = e.build(t);
    for (const it of its) items.push({ ...it, t: [it.t[0] + e.x, it.t[1], it.t[2]] });
  }
  drawer.draw(items);
};
