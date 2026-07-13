// Demo registration for the JOINTS tab group (hinge + ball).
//
// This module owns the demo's OWN piece meshes in the canonical frames the joint
// engine expects, then registers one subject per mechanism. Sliders drive the
// MOVING half in degrees while the fixed half holds; mount-frame gizmos mark the
// male (green) and female (red) mounts apart.
//
// It touches ONLY the joints tab group — it registers via the shared page's
// contract (push to window.__demoSubjects, or call window.registerSubject if the
// page has already loaded), so other engines' subjects are left untouched.

import { THREE, TAU, HPI, rad, qFromM3, alignY, geometryOf } from "./gfx.js";
import { makeJoints } from "./engines/joint.js";

const SIZE = 0.5;   // demo joint scale
const SLIM = 0.6;
const LIFT = 1.2;   // raise the joint off the grid for viewing

// ── mesh-builder utilities ───────────────────────────────────────────────────
// Every piece is baked to a non-indexed {positions, normals} triangle soup wound
// OUTWARD, then wrapped in a single-mesh via the shared geometry cache.

function bake(geo, mat) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (mat) g.applyMatrix4(mat);
  return { positions: g.attributes.position.array, normals: g.attributes.normal.array };
}
function merge(parts) {
  let np = 0, nn = 0;
  for (const p of parts) { np += p.positions.length; nn += p.normals.length; }
  const positions = new Float32Array(np), normals = new Float32Array(nn);
  let op = 0, on = 0;
  for (const p of parts) {
    positions.set(p.positions, op); op += p.positions.length;
    normals.set(p.normals, on); on += p.normals.length;
  }
  return { positions, normals };
}
const meshOf = (src) => new THREE.Mesh(geometryOf(src));
const T = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);
const Rz = (r) => new THREE.Matrix4().makeRotationZ(r);

// ── the cut-DOME CAP socket ──────────────────────────────────────────────────
// The UPPER half of a sphere over the ball (skirt rim at the equator y=0), with
// the top pole sliced into a small HOLE at +Y that the shaft exits. Double-walled
// (outer shell radius `outer`, inner shell radius `inner` with normals facing the
// cavity), BOTH cut edges closed by rings (the equator skirt at −Y and the top
// shaft hole at +Y). Every surface wound outward — NOT a full sphere, NOT a bowl.
function cutDomeCap(inner, outer, hole) {
  const SEG = 48;   // longitude segments (bounded)
  const BAND = 12;  // latitude bands per shell (bounded)
  const pos = [], nor = [];
  const phiO = Math.asin(Math.min(0.999, hole / outer)); // outer top-rim polar angle
  const phiI = Math.asin(Math.min(0.999, hole / inner)); // inner top-rim polar angle
  const EQ = HPI;                                         // equator polar angle

  // polar angle phi measured from +Y; azimuth th about +Y
  const P = (r, phi, th) => [r * Math.sin(phi) * Math.cos(th), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(th)];
  const N = (phi, th) => [Math.sin(phi) * Math.cos(th), Math.cos(phi), Math.sin(phi) * Math.sin(th)];

  // Emit one triangle wound so its FRONT face points along the intended normals.
  function tri(a, b, c, na, nb, nc) {
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const fn = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const av = [na[0] + nb[0] + nc[0], na[1] + nb[1] + nc[1], na[2] + nb[2] + nc[2]];
    if (fn[0] * av[0] + fn[1] * av[1] + fn[2] * av[2] < 0) {
      pos.push(...a, ...c, ...b); nor.push(...na, ...nc, ...nb); // flip winding
    } else {
      pos.push(...a, ...b, ...c); nor.push(...na, ...nb, ...nc);
    }
  }
  const quad = (a, b, c, d, na, nb, nc, nd) => { tri(a, b, c, na, nb, nc); tri(a, c, d, na, nc, nd); };

  // shell of `bands` between polar angles [p0..p1]; `sign` +1 outer (normal out),
  // −1 inner (normal toward cavity)
  function shell(r, top, sign) {
    for (let i = 0; i < BAND; i++) {
      const a = top + (EQ - top) * (i / BAND);
      const b = top + (EQ - top) * ((i + 1) / BAND);
      for (let j = 0; j < SEG; j++) {
        const t0 = TAU * (j / SEG), t1 = TAU * ((j + 1) / SEG);
        const A = P(r, a, t0), B = P(r, a, t1), C = P(r, b, t1), D = P(r, b, t0);
        const nA = N(a, t0).map((x) => x * sign), nB = N(a, t1).map((x) => x * sign);
        const nC = N(b, t1).map((x) => x * sign), nD = N(b, t0).map((x) => x * sign);
        quad(A, B, C, D, nA, nB, nC, nD);
      }
    }
  }
  shell(outer, phiO, +1);  // outer dome, normals outward
  shell(inner, phiI, -1);  // inner dome, normals into the cavity

  // equator skirt ring (−Y) : outer rim → inner rim, closing the mouth cut
  const down = [0, -1, 0];
  for (let j = 0; j < SEG; j++) {
    const t0 = TAU * (j / SEG), t1 = TAU * ((j + 1) / SEG);
    quad(P(outer, EQ, t0), P(outer, EQ, t1), P(inner, EQ, t1), P(inner, EQ, t0), down, down, down, down);
  }
  // top hole ring (+Y) : inner rim → outer rim, closing the shaft-exit cut
  const up = [0, 1, 0];
  for (let j = 0; j < SEG; j++) {
    const t0 = TAU * (j / SEG), t1 = TAU * ((j + 1) / SEG);
    quad(P(inner, phiI, t0), P(inner, phiI, t1), P(outer, phiO, t1), P(outer, phiO, t0), up, up, up, up);
  }
  return { positions: new Float32Array(pos), normals: new Float32Array(nor) };
}

// ── piece makers handed to the engine (canonical frames) ─────────────────────
const makers = {
  // D-plate: rounded knuckle (pin-hole axis X) at origin, flat body reaching −Y.
  plate: ({ knuckle, reach, width, thick }) => meshOf(merge([
    bake(new THREE.CylinderGeometry(knuckle, knuckle, thick, 20), Rz(HPI)),
    bake(new THREE.BoxGeometry(width, reach, thick), T(0, -reach / 2, 0)),
  ])),
  // rod centered at origin along X
  pin: ({ radius, length }) => meshOf(bake(new THREE.CylinderGeometry(radius, radius, length, 20), Rz(HPI))),
  // cut-dome cap, ball center at origin
  socket: ({ inner, outer, hole }) => meshOf(cutDomeCap(inner, outer, hole)),
  // sphere at origin + shaft reaching +Y
  ball: ({ radius, shaftR, shaftLen }) => meshOf(merge([
    bake(new THREE.SphereGeometry(radius, 28, 18), null),
    bake(new THREE.CylinderGeometry(shaftR, shaftR, shaftLen, 16), T(0, shaftLen / 2, 0)),
  ])),
  disc: ({ radius, height }) => meshOf(bake(new THREE.CylinderGeometry(radius, radius, height, 28), null)),
  box: ({ width, height, depth }) => meshOf(bake(new THREE.BoxGeometry(width, height, depth), null)),
};

const joints = makeJoints(makers);

// ── mount-frame gizmo (marks a mount apart) ──────────────────────────────────
function gizmo(fr, color) {
  const g = new THREE.Group();
  g.add(new THREE.AxesHelper(SIZE * 0.7));
  const mk = new THREE.Mesh(
    new THREE.SphereGeometry(SIZE * 0.12, 12, 8),
    new THREE.MeshBasicMaterial({ color }),
  );
  g.add(mk);
  g.position.set(fr.pos[0], fr.pos[1], fr.pos[2]);
  g.quaternion.fromArray(qFromM3(alignY(fr.normal))); // +Y of the gizmo → mount normal
  return g;
}

// ── subjects ─────────────────────────────────────────────────────────────────
function hingeSubject() {
  let j = null;
  return {
    kind: "joints",
    name: "hinge",
    caption: "hinge — 1 pin, 1 axis. Slider swings the male tongue; the female clevis holds. Green=male mount (+Y), red=female mount (−Y).",
    channels: [{ key: "angle", min: -120, max: 120, step: 1, label: "angle°" }],
    pose: { angle: 0 },
    home: { angle: 0 },
    build(scene) {
      j = joints.hinge(SIZE, SLIM);
      j.root.position.y = LIFT;
      j.root.add(gizmo(j.femaleMount, 0xff4444));
      j.root.add(gizmo(j.maleMount, 0x44ff66));
      scene.add(j.root);
      return j.root;
    },
    apply(pose) { if (j) j.male.rotation.x = rad(pose.angle); },
    dispose(scene, root) { scene.remove(root); j = null; },
  };
}

function ballSubject() {
  let j = null;
  return {
    kind: "joints",
    name: "ball",
    caption: "ball-and-socket — 3 axes. Sliders swing the ball; the cut-dome socket holds. Green=male mount (+Y shaft), red=female mount (−Y).",
    channels: [
      { key: "rx", min: -80, max: 80, step: 1, label: "pitch°" },
      { key: "ry", min: -80, max: 80, step: 1, label: "yaw°" },
      { key: "rz", min: -80, max: 80, step: 1, label: "roll°" },
    ],
    pose: { rx: 0, ry: 0, rz: 0 },
    home: { rx: 0, ry: 0, rz: 0 },
    build(scene) {
      j = joints.ball(SIZE, SLIM);
      j.root.position.y = LIFT;
      j.root.add(gizmo(j.femaleMount, 0xff4444));
      j.root.add(gizmo(j.maleMount, 0x44ff66));
      scene.add(j.root);
      return j.root;
    },
    apply(pose) { if (j) j.male.rotation.set(rad(pose.rx), rad(pose.ry), rad(pose.rz)); },
    dispose(scene, root) { scene.remove(root); j = null; },
  };
}

// exported for offline geometry checks (the page uses the registration below)
export { makers, joints, cutDomeCap };

// ── register (before OR after the shared page loads) ─────────────────────────
if (typeof window !== "undefined") {
  const mine = [hingeSubject(), ballSubject()];
  if (typeof window.registerSubject === "function") {
    for (const s of mine) window.registerSubject(s);
  } else {
    window.__demoSubjects = window.__demoSubjects || [];
    for (const s of mine) window.__demoSubjects.push(s);
  }
}
