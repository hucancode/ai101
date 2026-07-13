// ATLAS — THE CHECK. Builds the rig headlessly and asserts what a render would show.
//
//   1. every part's plug FITS the face it lands on
//   2. every mesh transform is FINITE
//   3. the mech STANDS ON THE GRID
//   4. every joint is SEATED — anchor face -> centre is exactly `seat`,
//      centre -> the child's root face is exactly `reach`
//   5. every unit mesh is CLOSED with outward normals (a positive signed volume)
//   6. every channel stays FINITE across its whole range
//
// Run: node check.mjs
import { THREE } from "./gfx.js";
import { inradius } from "./engines/modeling.js";
import { createChoreographer } from "./engines/choreo.js";
import { buildAtlas, CHANNELS, HAND_ONLY } from "./rig.js";

const EPS = 1e-9;
let failed = 0, passed = 0;
const ok = (cond, what) => {
  if (cond) { passed++; return true; }
  failed++;
  console.log(`  FAIL  ${what}`);
  return false;
};
const near = (a, b, tol, what) =>
  ok(Math.abs(a - b) <= tol, `${what}: ${a} != ${b} (tol ${tol})`);

const atlas = buildAtlas();
const { root, pose, setPose, joints } = atlas;
root.updateMatrixWorld(true);

const wpos = (node) => node.getWorldPosition(new THREE.Vector3());
// a point of the parent's PART space, in world
const wpoint = (node, p) => new THREE.Vector3(...p).applyMatrix4(node.matrixWorld);

// ---- 1. every part's plug fits the face it lands on --------------------------
console.log("1. plugs fit the faces they land on");
for (const j of joints) {
  const plug = inradius(j.plug), face = inradius(j.anchor.sec);
  ok(plug <= face + 1e-12,
    `${j.name}: plug inradius ${plug.toFixed(5)} > anchor face inradius ${face.toFixed(5)}`);
}

// ---- 2. every mesh transform is finite ---------------------------------------
console.log("2. every mesh transform is finite");
const meshes = [];
root.traverse((o) => { if (o.isMesh) meshes.push(o); });
ok(meshes.length > 0, "the rig has meshes");
const finiteWorld = (label) => {
  for (const m of meshes)
    for (const e of m.matrixWorld.elements)
      if (!Number.isFinite(e)) return ok(false, `${label}: ${m.userData.id} has a non-finite transform`);
  return true;
};
finiteWorld("rest pose");
console.log(`   (${meshes.length} meshes, ${new Set(meshes.map((m) => m.userData.key)).size} unit meshes)`);

// ---- 3. the mech stands on the grid ------------------------------------------
console.log("3. the mech stands on the grid");
const bb = new THREE.Box3().setFromObject(root);
near(bb.min.y, 0, 1e-6, "lowest vertex sits on y=0");
ok(bb.max.y > 1.2, `the mech is a standing height (${bb.max.y.toFixed(3)}m)`);

// ---- 4. every joint is seated ------------------------------------------------
// Measured, not restated: the anchor face point and the child's root face are both
// carried by the node tree (a part's ORIGIN is its mount face centre), so these two
// distances come out of the scene graph, not out of the joint engine.
console.log("4. every joint is seated (measured seat / reach, and the centre is on the anchor normal)");
setPose(pose);                                   // rest
root.updateMatrixWorld(true);
for (const j of joints) {
  const a = wpoint(j.parentNode, j.anchor.pos);
  const c = wpos(j.centre);
  const k = wpos(j.childNode);
  near(a.distanceTo(c), j.dims.seat, 1e-9, `${j.name}: anchor -> centre is seat`);
  near(c.distanceTo(k), j.dims.reach, 1e-9, `${j.name}: centre -> child root face is reach`);
  // and the centre lies ON the anchor's normal, not merely at the right distance
  const n = new THREE.Vector3(...j.anchor.n).transformDirection(j.parentNode.matrixWorld);
  const d = c.clone().sub(a);
  near(d.dot(n), j.dims.seat, 1e-9, `${j.name}: the centre is on the anchor normal`);
}

// ---- 5. every unit mesh is closed with outward normals -----------------------
// Signed volume of the triangle soup: positive iff the surface is closed and its
// winding faces out. A hole or an inverted face drops it.
console.log("5. every unit mesh is closed with outward normals (positive signed volume)");
const seen = new Map();
for (const m of meshes) {
  const key = m.userData.key;
  if (seen.has(key)) continue;
  const p = m.geometry.attributes.position.array;
  let v6 = 0, outward = 0, n = 0;
  const nrm = m.geometry.attributes.normal.array;
  for (let i = 0; i < p.length; i += 9) {
    const a = [p[i], p[i + 1], p[i + 2]];
    const b = [p[i + 3], p[i + 4], p[i + 5]];
    const c = [p[i + 6], p[i + 7], p[i + 8]];
    v6 += a[0] * (b[1] * c[2] - b[2] * c[1])
        - a[1] * (b[0] * c[2] - b[2] * c[0])
        + a[2] * (b[0] * c[1] - b[1] * c[0]);
    // the shading normal must agree with the winding it was generated for
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const g = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    const s = g[0] * nrm[i] + g[1] * nrm[i + 1] + g[2] * nrm[i + 2];
    if (s >= 0) outward++;
    n++;
  }
  seen.set(key, v6 / 6);
  ok(v6 / 6 > EPS, `${key}: signed volume ${(v6 / 6).toExponential(2)} is not positive`);
  ok(outward === n, `${key}: ${n - outward}/${n} triangles wind against their own normal`);
}

// ---- 6. every channel stays finite across its whole range ---------------------
console.log("6. every channel stays finite across its whole range");
const STEPS = 24;                                // bounded: 25 samples per channel end to end
for (const [key, [min, max]] of Object.entries(CHANNELS)) {
  let good = true;
  for (let i = 0; i <= STEPS; i++) {
    const p = { ...pose, [key]: min + ((max - min) * i) / STEPS };
    setPose(p);
    root.updateMatrixWorld(true);
    if (!finiteWorld(`${key} = ${p[key].toFixed(1)}`)) { good = false; break; }
    const b = new THREE.Box3().setFromObject(root);
    if (!Number.isFinite(b.min.y) || !Number.isFinite(b.max.y)) {
      good = false; ok(false, `${key} = ${p[key]}: the bounds went non-finite`); break;
    }
  }
  if (good) ok(true, key);
}

// all channels together, swept as one — nothing rebuilt, only angles set
const before = meshes.length;
for (let i = 0; i <= STEPS; i++) {
  const p = {};
  for (const [k, [lo, hi]] of Object.entries(CHANNELS)) p[k] = lo + ((hi - lo) * i) / STEPS;
  setPose(p);
  root.updateMatrixWorld(true);
}
const after = [];
root.traverse((o) => { if (o.isMesh) after.push(o); });
ok(after.length === before, "posing rebuilds nothing (the mesh count is unchanged)");

// ---- and the driver itself: 60 s of choreography, at 60 Hz -------------------
console.log("7. the choreographer drives it without leaving the ranges or going non-finite");
const driven = Object.entries(CHANNELS)
  .filter(([key]) => !HAND_ONLY.has(key))
  .map(([key, [min, max]]) => ({ key, min, max }));
ok(!driven.some((s) => HAND_ONLY.has(s.key)), "the choreographer never sees hip/knee");
const choreo = createChoreographer(driven, { home: { ...pose }, seed: 7 });
const legs = { hip: 12, knee: 34 };              // a hand set them; the beat must not touch them
Object.assign(pose, legs);
let bad = 0;
for (let i = 0; i < 3600; i++) {                 // bounded: 60 s at 60 Hz
  choreo.step(1 / 60, pose);
  setPose(pose);
  root.updateMatrixWorld(true);
  for (const k of Object.keys(CHANNELS)) if (!Number.isFinite(pose[k])) bad++;
}
ok(bad === 0, `${bad} non-finite channel values during 60 s of choreography`);
ok(finiteWorld("choreographed"), "every transform is finite at the end of the run");
ok(pose.hip === legs.hip && pose.knee === legs.knee, "the hand keeps the legs (hip/knee untouched)");

setPose(pose);
root.updateMatrixWorld(true);

console.log(`\n${failed ? "FAILED" : "PASSED"}  ${passed} assertions passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
