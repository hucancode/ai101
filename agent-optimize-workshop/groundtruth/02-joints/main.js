import { createViewer, createDrawer } from "./render.js";
import { JOINT_NAMES, jointModel } from "./joints.js";

// The whole joint catalog in a row, each mechanism articulating on its own
// pose axes, in degrees.
const SEED = 1;
const SPACING = 2.4;

const POSES = {
  hinge1: (t) => ({ swing: 50 * Math.sin(t) }),
  hinge2: (t) => ({ rx: 35 * Math.sin(t), rz: 35 * Math.sin(t * 0.8) }),
  ball1: (t) => ({ rx: 25 * Math.sin(t), ry: 40 * Math.sin(t * 0.7), rz: 25 * Math.sin(t * 1.2) }),
};

// disc bases read the turntable spins that a square box base would hide
const PARAMS = {
  hinge1: { discF: 1, discM: 1 },
  hinge2: { discF: 1, discMid: 1, discM: 1 },
  ball1: { disc: 1 },
};

const viewer = createViewer(document.getElementById("view"), { camDist: 9, camHeight: 1 });
const drawer = createDrawer(viewer.scene);

viewer.onFrame = (t) => {
  const items = [];
  JOINT_NAMES.forEach((name, i) => {
    const { items: its } = jointModel(name, SEED, PARAMS[name] ?? null, POSES[name](t));
    const x = (i - (JOINT_NAMES.length - 1) / 2) * SPACING;
    for (const it of its) { it.t[0] += x; it.t[1] += 1.2; items.push(it); }
  });
  drawer.draw(items);
};
