// ENGINE DEMO — no robot yet. Pick a SHAPE (procedural primitive; sliders =
// generation params) or a JOINT (sliders drive the male half). White marker =
// origin; f/b/n frames + magenta(male)/cyan(female) nodes mark the joint mounts.
import {
  createViewer, group, attachMesh, clearMeshes, vNorm, vCross, alignY, rad, colorOf, translate, THREE,
} from "./gfx.js";
import {
  box, cylinder, coneCut, sphere, cutHemisphere, halfCylinder, halfCylinderBox,
} from "./engines/modeling.js";
import { createJointKit, hingeReach, ballMounts } from "./engines/joint.js";

// the joint piece meshes the joint engine sizes + places (it generates none itself)
const MK = {
  arm: (kR, bLen, th) => halfCylinderBox(kR, th, bLen, 16),
  pin: (r, len) => cylinder(r, len, 20),
  socket: (rOut, wall, cut) => cutHemisphere(rOut, wall, cut, 28, 8),
  ball: (r) => sphere(r, 20, 14),
  shaft: (r, len) => cylinder(r, len, 18),
  box: (w, h, d) => box(w, h, d),
  disc: (r, h) => cylinder(r, h, 24),
};
const { buildJoint } = createJointKit(MK);

// run a builder, gather the meshes it emits (a single joint/shape preview)
const collect = (fn, pose) => { const out = []; fn((g) => out.push(g), null, pose || {}); return out; };
// the demo's own joint catalog (the engines expose createHinge/createBall by name;
// naming them "hinge" (L-seated) / "ball" and their DOF is a caller choice)
const JOINTS = {
  hinge: { mech: "hinge", form: "L", dof: ["swing"] },
  ball: { mech: "ball", dof: ["rx", "ry", "rz"] },
};
const jointDOF = (name) => JOINTS[name].dof;

const SEED = 1;

// ---- joints: the demo is the CALLER that composes the modeling halves. Each
// demo joint is one { size } — the assembly engine maps its lens into mount slots
// and the demo drives the male half by the DOF sliders (degrees). ------------
const JOINT_SIZE = { hinge: { size: 0.4 }, ball: { size: 0.4 } };

// mount slots for a named joint, built from the modeling engine's generic mount
// offsets (a = female, b = male) — no reaching into raw dims
const mountsOf = (name, jp) => {
  if (JOINTS[name].mech === "ball") {
    const m = ballMounts(jp);
    return {
      a: { pos: [0, -m.seat, 0], n: [0, -1, 0], f: [0, 0, 1] },
      b: { pos: [0, m.top, 0], n: [0, 1, 0], f: [0, 0, 1] },
    };
  }
  const r = hingeReach(jp);
  return {
    a: { pos: [r, 0, 0], n: [1, 0, 0], f: [0, 1, 0] },
    b: { pos: [0, 0, r], n: [0, 0, 1], f: [0, 1, 0] },
  };
};

// a standalone preview of one joint, DOF sliders (degrees) -> radians. The engine
// composes the two halves (both to one sink); "hinge" seats L, "ball" spins rx/ry/rz.
const jointPreview = (name, poseDeg) => {
  const jp = JOINT_SIZE[name];
  const pose = Object.fromEntries(jointDOF(name).map((k) => [k, rad(poseDeg[k] || 0)]));
  return collect((add) => buildJoint(name, add, add, jp, { pose }));
};

// ---- procedural shapes: [key, default, min, max, step] per parameter ---------

const SHAPES = {
  box: {
    p: [["w", 1, 0.2, 2, 0.05], ["h", 1, 0.2, 2, 0.05], ["d", 1, 0.2, 2, 0.05],
        ["slope", 0, 0, 0.9, 0.05], ["curve", 0, -1, 1, 0.05]],
    make: (v) => box(v.w, v.h, v.d, v.slope, v.curve),
  },
  cylinder: {
    p: [["r", 0.5, 0.1, 1, 0.02], ["h", 1, 0.2, 2, 0.05], ["seg", 24, 3, 48, 1]],
    make: (v) => cylinder(v.r, v.h, v.seg),
  },
  coneCut: {
    p: [["r0", 0.5, 0.1, 1, 0.02], ["r1", 0.25, 0, 1, 0.02], ["h", 1, 0.2, 2, 0.05], ["seg", 24, 3, 48, 1]],
    make: (v) => coneCut(v.r0, v.r1, v.h, v.seg),
  },
  sphere: {
    p: [["r", 0.5, 0.1, 1, 0.02], ["seg", 24, 3, 48, 1], ["rings", 16, 2, 32, 1]],
    make: (v) => sphere(v.r, v.seg, v.rings),
  },
  cutHemisphere: {
    p: [["r", 0.5, 0.1, 1, 0.02], ["t", 0.25, 0.02, 0.95, 0.02], ["cut", 0.7, 0, 0.98, 0.02],
        ["seg", 24, 3, 48, 1], ["rings", 6, 2, 16, 1]],
    make: (v) => cutHemisphere(v.r, v.t, v.cut, v.seg, v.rings),
  },
  halfCylinder: {
    p: [["r", 0.5, 0.1, 1, 0.02], ["h", 1, 0.2, 2, 0.05], ["seg", 12, 3, 32, 1]],
    make: (v) => halfCylinder(v.r, v.h, v.seg),
  },
  archBox: {
    p: [["r", 0.5, 0.1, 1, 0.02], ["h", 1, 0.2, 2, 0.05], ["depth", 0.5, 0.1, 1, 0.02], ["seg", 12, 3, 32, 1]],
    make: (v) => halfCylinderBox(v.r, v.h, v.depth, v.seg),
  },
};

// ---- gizmo geometry --------------------------------------------------------

const RED = [0.9, 0.25, 0.2], GREEN = [0.3, 0.85, 0.3], BLUE = [0.3, 0.5, 0.95];
const WHITE = [0.95, 0.95, 0.95], MAGENTA = [0.9, 0.3, 0.85], CYAN = [0.3, 0.8, 0.85];

// each gizmo helper returns [mesh, color] pairs; the render loop colours + parents.
const _m4 = new THREE.Matrix4();
const orient = (g, m3) => g.matrix.premultiply(
  _m4.set(m3[0], m3[1], m3[2], 0, m3[3], m3[4], m3[5], 0, m3[6], m3[7], m3[8], 0, 0, 0, 0, 1));

// a thin bar from `pos` along `dir` — a unit cylinder oriented and scaled
function bar(pos, dir, color, len = 0.16, rr = 0.008) {
  const g = cylinder(rr, len, 10);          // +Y, scale (rr, len, rr)
  orient(g, alignY(dir));                    // aim +Y onto dir
  return [translate(g, pos[0], pos[1], pos[2]), color];
}
const node = (pos, color, r = 0.03) => [translate(sphere(r, 12, 8), pos[0], pos[1], pos[2]), color];
function slotGizmo(slot, male) {
  const f = vNorm(slot.f), n = vNorm(slot.n), b = vCross(n, f);
  return [node(slot.pos, male ? MAGENTA : CYAN), bar(slot.pos, f, RED), bar(slot.pos, b, GREEN), bar(slot.pos, n, BLUE)];
}
const originMarker = () => [[box(0.08, 0.08, 0.08), WHITE]];

// ---- subjects --------------------------------------------------------------

let subject = { kind: "shape", name: "box" };
let pose = {};   // current slider values for the active subject

function controls() {
  if (subject.kind === "shape")
    return SHAPES[subject.name].p.map(([key, def, min, max, step]) => ({ key, min, max, step, def }));
  return jointDOF(subject.name).map((key) => ({ key, min: -90, max: 90, step: 1, def: 0 }));
}

// build the active subject as a list of [mesh, color] pairs
function build() {
  if (subject.kind === "shape") {
    const g = SHAPES[subject.name].make(pose);
    return [[g, colorOf(g.userData.id, SEED)], ...originMarker()];
  }
  const out = jointPreview(subject.name, pose).map((g) => [g, colorOf(g.userData.id, SEED)]);
  out.push(...originMarker());
  const m = mountsOf(subject.name, JOINT_SIZE[subject.name]);
  if (m) out.push(...slotGizmo(m.b, true), ...slotGizmo(m.a, false));   // b = male, a = female
  return out;
}

// ---- page ------------------------------------------------------------------

const viewer = createViewer(document.getElementById("view"), { camDist: 3, camHeight: 0, target: [0, 0, 0] });
const stage = group(null);   // subject meshes hang here; rebuilt each frame
viewer.scene.add(stage);

const tabs = document.getElementById("tabs");
const panel = document.getElementById("params");
const caption = document.getElementById("caption");

const groupLabel = (text) =>
  tabs.append(Object.assign(document.createElement("span"), { textContent: text, className: "grouplabel" }));
const makeTab = (label, sub) => {
  const b = document.createElement("button");
  b.textContent = label;
  b.onclick = () => { subject = sub; pose = {}; rebuild(); };
  tabs.appendChild(b);
};
groupLabel("shapes:");
Object.keys(SHAPES).forEach((n) => makeTab(n, { kind: "shape", name: n }));
groupLabel("joints:");
Object.keys(JOINTS).forEach((n) => makeTab(n, { kind: "joint", name: n }));

function rebuild() {
  panel.innerHTML = "";
  for (const c of controls()) {
    pose[c.key] = pose[c.key] ?? c.def;
    const row = document.createElement("label");
    const input = document.createElement("input");
    input.type = "range"; input.min = c.min; input.max = c.max; input.step = c.step; input.value = pose[c.key];
    const val = document.createElement("span");
    val.textContent = String(pose[c.key]);
    input.addEventListener("input", () => { pose[c.key] = +input.value; val.textContent = input.value; render(); });
    row.append(`${c.key} `, input, val);
    panel.appendChild(row);
  }
  caption.textContent = subject.kind === "shape"
    ? `${subject.name}: procedural primitive. white marker = origin.`
    : `${subject.name}: drive DOF; male (magenta) turns, female (cyan) holds.`;
  render();
}

// rebuild the stage — only on a subject switch or a slider move, not every frame.
// createViewer's own loop keeps rendering (orbiting) this static scene meanwhile.
function render() {
  clearMeshes(stage);
  for (const [mesh, color] of build()) attachMesh(stage, mesh, color);
}
rebuild();
