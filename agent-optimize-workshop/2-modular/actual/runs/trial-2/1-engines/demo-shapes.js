// modeling engine demo — the "shapes" tab group: one tab per core.
//
// Sliders are the core's own params. The origin is marked (it is always the solid's
// bounding-box centre) and every named face is overlaid with its frame: u red,
// v green, n blue, plus the outline of its section — the exact shape the joint
// engine sizes its hardware from.
//
// Registered by main.js through the shared `subjects` contract.

import { THREE, colorOf, TAU, HPI, vAdd, vScale } from "./gfx.js";
import * as M from "./engines/modeling.js";

const AXES = ["x", "y", "z"];
const U_COL = 0xff4d4d, V_COL = 0x7dcb2f, N_COL = 0x4da3ff;
const ARROW = 0.45;   // length of a face's frame arrows
const ORIGIN = 0.9;   // length of the origin cross

// the 4 directions perpendicular to an axis — a half-cylinder can only bulge one way
const perp = (axis) => {
  const others = AXES.filter((a) => a !== axis);
  return [`+${others[0]}`, `-${others[0]}`, `+${others[1]}`, `-${others[1]}`];
};

function lines(pts, color) {
  const g = new THREE.BufferGeometry().setFromPoints(pts.map((p) => new THREE.Vector3(...p)));
  return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color }));
}
function loop(pts, color) {
  const g = new THREE.BufferGeometry().setFromPoints(pts.map((p) => new THREE.Vector3(...p)));
  return new THREE.LineLoop(g, new THREE.LineBasicMaterial({ color }));
}

// the face's section, drawn in the face's own (u, v) frame — bbox-centred, so it
// lands exactly where a plate cut from it would
function sectionLoop(f) {
  const at = (a, b) => vAdd(f.pos, vAdd(vScale(f.u, a), vScale(f.v, b)));
  const s = f.sec;
  if (s.kind === "rect") {
    const w = s.w / 2, d = s.d / 2;
    return loop([at(-w, -d), at(w, -d), at(w, d), at(-w, d)], 0xf1c40f);
  }
  if (s.kind === "disc") {
    const pts = [];
    for (let i = 0; i < 48; i++) {
      const t = (i / 48) * TAU;
      pts.push(at(Math.cos(t) * s.r, Math.sin(t) * s.r));
    }
    return loop(pts, 0xf1c40f);
  }
  // halfDisc: flat edge at -v, curved apex toward +v (bbox-centred)
  const pts = [];
  for (let i = 0; i <= 24; i++) {
    const t = (i / 24) * Math.PI;
    pts.push(at(Math.cos(t) * s.r, -s.r / 2 + Math.sin(t) * s.r));
  }
  return loop(pts, 0xf1c40f);
}

// u / v / n as three arrows planted on the face
function frameGizmo(f) {
  const g = new THREE.Group();
  const seg = (dir, len, col) => lines([f.pos, vAdd(f.pos, vScale(dir, len))], col);
  g.add(seg(f.u, ARROW, U_COL));
  g.add(seg(f.v, ARROW, V_COL));
  g.add(seg(f.n, ARROW * 1.3, N_COL));
  const tip = new THREE.Mesh(
    new THREE.SphereGeometry(0.035, 8, 6),
    new THREE.MeshBasicMaterial({ color: N_COL }),
  );
  tip.position.set(...vAdd(f.pos, vScale(f.n, ARROW * 1.3)));
  g.add(tip);
  return g;
}

function originMarker() {
  const g = new THREE.Group();
  g.add(lines([[-ORIGIN, 0, 0], [ORIGIN, 0, 0]], U_COL));
  g.add(lines([[0, -ORIGIN, 0], [0, ORIGIN, 0]], V_COL));
  g.add(lines([[0, 0, -ORIGIN], [0, 0, ORIGIN]], N_COL));
  const dot = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
  );
  g.add(dot);
  return g;
}

// A tab: rebuild the handle from the pose, show it, overlay every named face.
function shapeSubject(name, channels, home, makeHandle, faceList) {
  return {
    kind: "shapes",
    name,
    build(scene) {
      const root = new THREE.Group();
      root.add(originMarker());
      scene.add(root);

      const pose = { ...home };
      let shown = null;       // the THREE.Group holding the current solid + overlays
      let sig = null;         // rebuild only when a param actually moved

      const rebuild = () => {
        if (shown) {
          root.remove(shown);
          shown.traverse((o) => o.geometry?.dispose?.());
        }
        shown = new THREE.Group();

        const h = makeHandle(pose);
        const mesh = h.mesh();
        mesh.material = new THREE.MeshPhongMaterial({
          color: new THREE.Color(...colorOf(h.id)),   // identical pieces, identical colour
          shininess: 60,
          transparent: true,
          opacity: 0.82,
        });
        shown.add(mesh);

        for (const spec of faceList(pose)) {
          const f = h.face(spec.name, spec.arg);
          shown.add(frameGizmo(f));
          shown.add(sectionLoop(f));
        }
        root.add(shown);
        return h;
      };

      let h = rebuild();

      return {
        channels,
        pose,
        get caption() {
          return `${name} — ${h.id} · faces: ${h.faceNames().join(", ")} · ` +
            "origin = bbox centre (white dot); face frames u red, v green, n blue; " +
            "yellow = the face's section";
        },
        update() {
          const s = channels.map((c) => pose[c.key].toFixed(4)).join("|");
          if (s !== sig) { sig = s; h = rebuild(); }
        },
        dispose() {
          scene.remove(root);
          root.traverse((o) => o.geometry?.dispose?.());
        },
      };
    },
  };
}

// ---- one tab per core --------------------------------------------------------

const BOX_FACES = ["top", "bottom", "left", "right", "front", "back"];

export const subjects = [
  shapeSubject(
    "box",
    [
      { key: "w", min: 0.3, max: 3 },
      { key: "h", min: 0.3, max: 3 },
      { key: "d", min: 0.3, max: 3 },
      { key: "slope", min: 0, max: 1 },
      { key: "curve", min: -1, max: 1 },
    ],
    { w: 1.6, h: 1.2, d: 2.2, slope: 0, curve: 0 },
    (p) => M.box(p.w, p.h, p.d, { slope: p.slope, curve: p.curve }),
    () => BOX_FACES.map((name) => ({ name })),
  ),

  shapeSubject(
    "cylinder",
    [
      { key: "r", min: 0.15, max: 1.5 },
      { key: "h", min: 0.3, max: 3 },
      { key: "axis", min: 0, max: 2 },        // 0 = x, 1 = y, 2 = z
      { key: "sideAngle", min: -Math.PI, max: Math.PI },
    ],
    { r: 0.7, h: 2, axis: 1, sideAngle: 0 },
    (p) => M.cylinder(p.r, p.h, AXES[Math.round(p.axis)]),
    (p) => [
      { name: "cap0" }, { name: "cap1" },
      { name: "side", arg: p.sideAngle },
    ],
  ),

  shapeSubject(
    "halfCylinder",
    [
      { key: "r", min: 0.15, max: 1.5 },
      { key: "h", min: 0.3, max: 3 },
      { key: "axis", min: 0, max: 2 },        // 0 = x, 1 = y, 2 = z
      { key: "round", min: 0, max: 3 },       // which of the 4 perpendicular ways it bulges
      { key: "sideAngle", min: -HPI, max: HPI },
    ],
    { r: 0.8, h: 2, axis: 1, round: 0, sideAngle: 0 },
    (p) => {
      const axis = AXES[Math.round(p.axis)];
      return M.halfCylinder(p.r, p.h, axis, perp(axis)[Math.round(p.round)]);
    },
    (p) => [
      { name: "cap0" }, { name: "cap1" }, { name: "flat" },
      { name: "side", arg: Math.max(-HPI, Math.min(HPI, p.sideAngle)) },
    ],
  ),
];
