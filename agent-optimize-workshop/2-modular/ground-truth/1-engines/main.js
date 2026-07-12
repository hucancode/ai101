// ENGINE DEMO — no robot yet. Pick a SHAPE (one of the modeling engine's three cores;
// sliders = its own params, its faces drawn with their normals) or a JOINT (the joint
// engine's mechanisms; sliders drive the moving half in degrees, plus the PLUG — the
// section of the limb that lands on the joint, which is the only size a joint is given).
//
// White marker = origin. On a joint: the anchor face is cyan, the rotation centre
// magenta, and the two spans between them are the engine's own `seat` and `reach`.
import {
  createViewer, group, frameNode, attachMesh, clearMeshes, alignY, rad, colorOf,
  translate, THREE, vAdd, vScale,
} from "./gfx.js";
import {
  box, cylinder, halfCylinder, faceOf, disc, rect, plate, inradius,
} from "./engines/modeling.js";
import { build as buildJoint } from "./engines/joint.js";

const SEED = 1;

// ---- shapes: [key, default, min, max, step] per parameter -------------------

const SHAPES = {
  box: {
    p: [["w", 1, 0.2, 2, 0.05], ["h", 1, 0.2, 2, 0.05], ["d", 1, 0.2, 2, 0.05],
        ["slope", 0, 0, 0.9, 0.05], ["curve", 0, -1, 1, 0.05]],
    make: (v) => box(v.w, v.h, v.d, { slope: v.slope, curve: v.curve }),
    faces: ["top", "bottom", "left", "right", "front", "back"],
  },
  cylinder: {
    p: [["r", 0.5, 0.1, 1, 0.02], ["h", 1, 0.2, 2, 0.05], ["seg", 24, 3, 48, 1]],
    make: (v) => cylinder(v.r, v.h, { seg: v.seg }),
    faces: ["top", "bottom", "side"],
  },
  halfCylinder: {
    p: [["r", 0.5, 0.1, 1, 0.02], ["h", 1, 0.2, 2, 0.05], ["seg", 16, 3, 32, 1]],
    make: (v) => halfCylinder(v.r, v.h, { seg: v.seg }),
    faces: ["top", "bottom", "flat", "round"],
  },
};

// ---- joints ----------------------------------------------------------------
// Each is built against ONE anchor — the top face of a block standing in for a
// parent limb — and ONE plug section, standing in for the child's. Change the plug
// and every dimension of the hardware follows it: that IS the engine's contract.

const JOINTS = {
  hinge: { kind: "hinge", at: "top" },
  // the shoulder case: hung off a SIDE face, aiming down — a corner, expressed by
  // aiming, plus a collar so the whole clevis spins in the seat plate
  "hinge+collar": { kind: "hinge", at: "right", collar: true, aim: "along" },
  ball: { kind: "ball", at: "top" },
  universal: { kind: "universal", at: "top", collar: true },
};
const PLUG = [["plug", 0.4, 0.15, 0.8, 0.02], ["boxy", 0, 0, 1, 1]];   // boxy: disc -> rect

// ---- gizmos ----------------------------------------------------------------

const RED = [0.9, 0.25, 0.2], GREEN = [0.3, 0.85, 0.3], BLUE = [0.3, 0.5, 0.95];
const WHITE = [0.95, 0.95, 0.95], MAGENTA = [0.9, 0.3, 0.85], CYAN = [0.3, 0.8, 0.85];

const _m4 = new THREE.Matrix4();
const orient = (g, m3) => g.matrix.premultiply(
  _m4.set(m3[0], m3[1], m3[2], 0, m3[3], m3[4], m3[5], 0, m3[6], m3[7], m3[8], 0, 0, 0, 0, 1));

// a thin bar from `pos` along `dir`
function bar(pos, dir, color, len = 0.18, rr = 0.008) {
  const g = cylinder(rr, len, { seg: 10 });
  orient(g, alignY(dir));
  return [translate(g, pos[0], pos[1], pos[2]), color];
}
const dot = (pos, color, r = 0.03) =>
  [translate(cylinder(r, 2 * r, { seg: 10 }), pos[0], pos[1] - r, pos[2]), color];
const originMarker = () => [[box(0.06, 0.06, 0.06), WHITE]];

// a face, drawn as its frame: u red, v green, n blue
const faceGizmo = (f) => [
  dot(f.pos, CYAN), bar(f.pos, f.u, RED), bar(f.pos, f.v, GREEN), bar(f.pos, f.n, BLUE),
];

// ---- subjects --------------------------------------------------------------

let subject = { kind: "shape", name: "box" };
let vals = {};

function controls() {
  if (subject.kind === "shape")
    return SHAPES[subject.name].p.map(([key, def, min, max, step]) => ({ key, min, max, step, def }));
  const j = JOINTS[subject.name];
  const bones = { hinge: ["pin"], ball: ["rx", "ry", "rz"], universal: ["pinA", "pinB"] }[j.kind];
  return [
    ...PLUG.map(([key, def, min, max, step]) => ({ key, min, max, step, def })),
    ...(j.collar ? [{ key: j.kind === "universal" ? "twist" : "collar", min: -90, max: 90, step: 1, def: 0 }] : []),
    ...bones.map((key) => ({ key, min: -90, max: 90, step: 1, def: 0 })),
  ];
}

// the stage: a parent block, the joint's female half on it, its bones, and a stub
// limb hanging off the far end — the engine places all of it.
function buildJointStage(stage, name) {
  const j = JOINTS[name];
  const sec = vals.boxy ? rect(2 * vals.plug, 1.4 * vals.plug) : disc(vals.plug);
  const R = inradius(sec);

  const parent = box(4 * R, 1.2 * R, 3 * R);                  // stands in for the parent limb
  attachMesh(stage, parent, colorOf(parent.userData.id, SEED));
  const anchor = faceOf(parent, j.at);

  const built = buildJoint(j.kind, anchor, sec, { collar: j.collar, aim: j.aim });
  for (const m of built.fixed) attachMesh(stage, m, colorOf(m.userData.id, SEED));

  let host = stage;
  for (const b of built.bones) {
    const bone = group(b.rest ? frameNode(host, b.rest) : host);
    for (const m of b.meshes) attachMesh(bone, m, colorOf(m.userData.id, SEED));
    bone.rotation[b.axis] = rad(vals[b.name] ?? 0) * b.sign;
    host = bone;
  }
  const child = group(host, built.childOffset);               // the child's own space
  const stub = translate(plate(sec, 2.4 * R), 0, -1.2 * R, 0);
  attachMesh(child, stub, colorOf(stub.userData.id, SEED));

  // the seating rule, drawn: anchor face -> centre is `seat`, centre -> child is `reach`
  for (const [m, c] of faceGizmo(anchor)) attachMesh(stage, m, c);
  const centre = vAdd(anchor.pos, vScale(anchor.n, built.dims.seat));
  for (const [m, c] of [dot(centre, MAGENTA, 0.035)]) attachMesh(stage, m, c);
  return `${name}: plug r=${R.toFixed(2)} -> seat ${built.dims.seat.toFixed(2)}, reach ${built.dims.reach.toFixed(2)}. every dimension is a ratio of the plug.`;
}

function buildShapeStage(stage, name) {
  const S = SHAPES[name];
  const g = S.make(vals);
  attachMesh(stage, g, colorOf(g.userData.id, SEED));
  for (const [m, c] of originMarker()) attachMesh(stage, m, c);
  for (const f of S.faces)
    for (const [m, c] of faceGizmo(faceOf(g, f))) attachMesh(stage, m, c);
  return `${name}: origin = the bounding-box centre (white). each face's frame: u red, v green, n blue.`;
}

// ---- page ------------------------------------------------------------------

const viewer = createViewer(document.getElementById("view"), { camDist: 3, camHeight: 0, target: [0, 0, 0] });
const root = group(null);
viewer.scene.add(root);

const tabs = document.getElementById("tabs");
const panel = document.getElementById("params");
const caption = document.getElementById("caption");

const groupLabel = (text) =>
  tabs.append(Object.assign(document.createElement("span"), { textContent: text, className: "grouplabel" }));
const makeTab = (label, sub) => {
  const b = document.createElement("button");
  b.textContent = label;
  b.onclick = () => { subject = sub; vals = {}; rebuild(); };
  tabs.appendChild(b);
};
groupLabel("shapes:");
Object.keys(SHAPES).forEach((n) => makeTab(n, { kind: "shape", name: n }));
groupLabel("joints:");
Object.keys(JOINTS).forEach((n) => makeTab(n, { kind: "joint", name: n }));

function rebuild() {
  panel.innerHTML = "";
  for (const c of controls()) {
    vals[c.key] = vals[c.key] ?? c.def;
    const row = document.createElement("label");
    const input = document.createElement("input");
    input.type = "range";
    input.min = c.min; input.max = c.max; input.step = c.step; input.value = vals[c.key];
    const val = document.createElement("span");
    val.textContent = String(vals[c.key]);
    input.addEventListener("input", () => { vals[c.key] = +input.value; val.textContent = input.value; render(); });
    row.append(`${c.key} `, input, val);
    panel.appendChild(row);
  }
  render();
}

// the stage is rebuilt on a subject switch or a slider move — not per frame. The
// viewer's own loop keeps orbiting this static scene meanwhile.
function render() {
  for (let i = root.children.length - 1; i >= 0; i--) root.remove(root.children[i]);
  clearMeshes(root);
  const stage = group(root);
  caption.textContent = subject.kind === "shape"
    ? buildShapeStage(stage, subject.name)
    : buildJointStage(stage, subject.name);
}
rebuild();
