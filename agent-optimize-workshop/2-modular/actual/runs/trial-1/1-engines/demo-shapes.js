// Demo wiring for the modeling engine: the "shapes" tab group. One subject per
// primitive; its channels are the primitive's own params; an axes marker sits at
// the primitive's documented origin (the root, 0,0,0) so you can see where a
// consumer seats it. Registers through the shared demo's subject contract
// (window.registerSubject / window.__demoSubjects) — it adds only this group and
// leaves every other engine's subjects untouched.

import { THREE, attachMesh, colorOf } from "./gfx.js";
import { box, cylinder, coneCut, sphere, cutDome, halfCylinder, archBox } from "./engines/modeling.js";

// A generic "shape" subject: `make(pose)` returns a fresh primitive handle; the
// panel rebuilds it live as the params (channels) change.
function shapeSubject(name, origin, channels, defaults, make) {
  const pose = { ...defaults };
  let root = null, meshNode = null;
  return {
    kind: "shapes",
    name,
    caption: `${name} — origin (axes marker) at ${origin}. Sliders are its ratios & size.`,
    channels,
    pose,
    home: { ...defaults },
    seed: 3,
    build(scene) {
      root = new THREE.Group();
      root.add(new THREE.AxesHelper(0.7));    // origin marker overlaid at (0,0,0)
      scene.add(root);
      this.apply(pose);
      return root;
    },
    apply(p) {
      if (meshNode) root.remove(meshNode);
      const mesh = make(p);
      attachMesh(root, mesh, colorOf(mesh.userData.id));   // identity coloring
      meshNode = mesh;
    },
    dispose(scene, r) { scene.remove(r); meshNode = null; },
  };
}

// integer channel helper (segment counts): step 1, floored on use
const seg = (min, max) => ({ min, max, step: 1 });

const subjects = [
  shapeSubject("box", "center",
    [
      { key: "w", min: 0.3, max: 3 }, { key: "h", min: 0.3, max: 3 }, { key: "d", min: 0.3, max: 3 },
      { key: "slope", min: 0, max: 1 }, { key: "curve", min: -1, max: 1 },
    ],
    { w: 1.6, h: 1.1, d: 1.2, slope: 0.35, curve: 0.5 },
    (p) => box(p.w, p.h, p.d, p.slope, p.curve)),

  shapeSubject("cylinder", "base-circle center (+Y)",
    [{ key: "r", min: 0.2, max: 2 }, { key: "h", min: 0.3, max: 3 }, { key: "sides", ...seg(3, 40) }],
    { r: 0.9, h: 2, sides: 24 },
    (p) => cylinder(p.r, p.h, p.sides)),

  shapeSubject("coneCut", "base center (+Y)",
    [
      { key: "r0", min: 0.2, max: 2 }, { key: "r1", min: 0, max: 2 },
      { key: "h", min: 0.3, max: 3 }, { key: "sides", ...seg(3, 40) },
    ],
    { r0: 1, r1: 0.35, h: 2, sides: 24 },
    (p) => coneCut(p.r0, p.r1, p.h, p.sides)),

  shapeSubject("sphere", "center",
    [{ key: "r", min: 0.3, max: 2 }, { key: "sides", ...seg(3, 40) }, { key: "rings", ...seg(2, 30) }],
    { r: 1.2, sides: 24, rings: 16 },
    (p) => sphere(p.r, p.sides, p.rings)),

  shapeSubject("cutDome", "base-rim (equator) center = sphere center; dome +Y",
    [
      { key: "r", min: 0.4, max: 2 }, { key: "wall", min: 0.05, max: 0.5 },
      { key: "cut", min: 0.05, max: 0.9 }, { key: "sides", ...seg(3, 40) }, { key: "rings", ...seg(1, 20) },
    ],
    { r: 1.3, wall: 0.15, cut: 0.35, sides: 28, rings: 12 },
    (p) => cutDome(p.r, p.wall, p.cut, p.sides, p.rings)),

  shapeSubject("halfCylinder", "base half-circle center (round +Z, flat XY, +Y)",
    [{ key: "r", min: 0.3, max: 2 }, { key: "h", min: 0.3, max: 3 }, { key: "sides", ...seg(2, 40) }],
    { r: 1, h: 2, sides: 24 },
    (p) => halfCylinder(p.r, p.h, p.sides)),

  shapeSubject("archBox", "cylinder-circle center",
    [
      { key: "r", min: 0.3, max: 2 }, { key: "h", min: 0.3, max: 3 },
      { key: "depth", min: 0.2, max: 3 }, { key: "sides", ...seg(2, 32) },
    ],
    { r: 1, h: 1.2, depth: 1.5, sides: 16 },
    (p) => archBox(p.r, p.h, p.depth, p.sides)),
];

// Register through the shared contract, whether main.js has loaded yet or not.
const pending = (window.__demoSubjects = window.__demoSubjects || []);
for (const s of subjects) {
  if (typeof window.registerSubject === "function") window.registerSubject(s);
  else pending.push(s);
}
