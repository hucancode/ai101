import { createViewer, createDrawer } from "./render.js";
import * as P from "./primitives.js";
import * as J from "./joints.js";

// Animated gallery: the 3 catalog entries (hinge1, hinge2, ball1) side by
// side, every pose axis visibly articulating. Disc bases are turned on
// (hinge1/hinge2) so the swinging plates read clearly as they rotate.
const SEED = 3;

const ENTRIES = [
  {
    name: "hinge1 — 1DOF",
    fn: J.hinge1,
    params: { discBases: true },
    pose: (t) => ({ swing: Math.sin(t * 0.9) * rad(55) }),
    x: -2.3,
  },
  {
    name: "hinge2 — 2DOF",
    fn: J.hinge2,
    params: { discBases: true },
    pose: (t) => ({
      rx: Math.sin(t * 0.7) * rad(38),
      rz: Math.sin(t * 1.1 + 1.3) * rad(48),
    }),
    x: 0,
  },
  {
    name: "ball1 — 3DOF",
    fn: J.ball1,
    params: {},
    pose: (t) => ({
      rx: Math.sin(t * 0.8) * rad(32),
      ry: Math.sin(t * 0.5 + 2.1) * rad(45),
      rz: Math.sin(t * 1.3 + 0.6) * rad(28),
    }),
    x: 2.3,
  },
];

function rad(deg) { return (deg * Math.PI) / 180; }

const viewer = createViewer(document.getElementById("view"), {
  camDist: 5.4, camHeight: 0.9, target: [0, 0.15, 0],
});
const drawer = createDrawer(viewer.scene);

viewer.onFrame = (t) => {
  const all = [];
  for (const e of ENTRIES) {
    const { items } = P.collect(e.fn, SEED, e.params, e.pose(t));
    for (const it of items) {
      it.t = [it.t[0] + e.x, it.t[1], it.t[2]];
      all.push(it);
    }
  }
  drawer.draw(all);
};
