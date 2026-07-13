// atlas — the check. Builds the rig headlessly and asserts what a render would show.
//
//   node check.js
//
// Every assertion is MEASURED off the assembled rig — nothing is re-derived from the
// numbers that built it.

import { THREE, vAdd, vSub, vScale, vLen, vNorm, vCross, HPI } from "./gfx.js";
import { signedVolume } from "./engines/modeling.js";
import { pose as poseJoint } from "./engines/joint.js";
import { buildAtlas } from "./atlas/rig.js";
import { subjects } from "./atlas.js";
import { createChoreographer } from "./engines/choreo.js";

const TOL = 1e-9;       // absolute, on a mech about 1.9 units tall
const FIT_TOL = 1e-9;
const SWEEP = 25;       // samples across a channel's range

let failed = 0, passed = 0;
const ok = (name, cond, detail = "") => {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.log(`  FAIL ${name}${detail ? `  — ${detail}` : ""}`); }
};
const section = (s) => console.log(`\n${s}`);

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const finite4 = (m) => m.elements.every(Number.isFinite);

// --- sections ---------------------------------------------------------------
// A section's outline, in its OWN (w-axis, d-axis) — the same axes `plate(sec, t)` lays
// the slab out on: w along the plate's X, d along its Z.
const ARC = 32;
function outline(sec) {
  switch (sec.kind) {
    case "rect": {
      const a = sec.w / 2, b = sec.d / 2;
      return [[a, b], [-a, b], [-a, -b], [a, -b]];
    }
    case "disc": {
      const p = [];
      for (let i = 0; i < ARC; i++) {
        const t = (2 * Math.PI * i) / ARC;
        p.push([sec.r * Math.cos(t), sec.r * Math.sin(t)]);
      }
      return p;
    }
    case "halfDisc": {
      // plate(halfDisc(r), t) = halfCylinder(r, t, "y", "-z"): bbox 2r x t x r, the flat
      // plane at +r/2, the apex at -r/2, the circle's centre ON the flat plane.
      const p = [];
      for (let i = 0; i <= ARC; i++) {
        const t = -HPI + (Math.PI * i) / ARC;
        p.push([sec.r * Math.sin(t), sec.r / 2 - sec.r * Math.cos(t)]);
      }
      return p;
    }
    default: throw new Error(`check: unknown section kind "${sec.kind}"`);
  }
}

// Is the point (a along u, b along v) inside `sec`, measured from the section's centre?
function contains(sec, a, b) {
  switch (sec.kind) {
    case "rect": return Math.abs(a) <= sec.w / 2 + FIT_TOL && Math.abs(b) <= sec.d / 2 + FIT_TOL;
    case "disc": return Math.hypot(a, b) <= sec.r + FIT_TOL;
    case "halfDisc":
      // the section's own convention: flat edge along u, curved apex toward +v
      return b >= -sec.r / 2 - FIT_TOL && Math.hypot(a, b + sec.r / 2) <= sec.r + FIT_TOL;
    default: throw new Error(`check: unknown section kind "${sec.kind}"`);
  }
}

// ---------------------------------------------------------------------------

console.log("atlas — headless check");
const rig = buildAtlas();
const meshes = [];
rig.root.traverse((o) => { if (o.isMesh) meshes.push(o); });
rig.root.updateMatrixWorld(true);

// --- the mech is the mech ----------------------------------------------------
section("structure");
{
  const ids = Object.keys(rig.parts);
  const count = (p) => rig.joints.filter((j) => j.link.part === p).length;
  ok("one pelvis (the root), one torso, one head",
    rig.parts.pelvis && count("torso") === 1 && count("head") === 1);
  ok("two arms: 2 upperArm + 2 forearm + 2 palm",
    count("upperArm") === 2 && count("forearm") === 2 && count("palm") === 2);
  ok("two 3-finger grippers, 3 digits each (18 digits)", count("digit") === 18);
  ok("two legs with feet: 2 thigh + 2 shin + 2 foot",
    count("thigh") === 2 && count("shin") === 2 && count("foot") === 2);
  ok(`${rig.joints.length} joints, ${ids.length} parts, ${meshes.length} meshes`, true);
  ok("14 channels, choreographer sees 12 (never hip/knee)",
    rig.channels.length === 14 && rig.choreoChannels.length === 12 &&
    !rig.choreoChannels.some((c) => c.key === "hip" || c.key === "knee"));
}

// --- every part's plug fits the face it lands on -------------------------------
section("every part's plug fits the face it lands on");
{
  let worst = null, worstSlack = Infinity, bad = 0;
  for (const { link, joint, face } of rig.joints) {
    const sec = rig.parts[link.id].sec;              // the plug: the joint's ONE dimension
    const n = vNorm(face.n);
    const pin = joint.pin;                           // the plate's own X, in the parent's space
    const w2 = vCross(pin, n);                       // ... and its own Z
    const off = face.off ?? [0, 0];                  // where the anchor sits in its face's section
    for (const [a, b] of outline(sec)) {
      const p = vAdd(vScale(pin, a), vScale(w2, b)); // a plug corner, about the anchor point
      const du = off[0] + dot(p, face.u);
      const dv = off[1] + dot(p, face.v);
      if (!contains(face.sec, du, dv)) { bad++; worst = `${link.id} on ${link.parent}.${link.anchor}`; }
      // how much room is left, worst case, as a fraction
      const slack = face.sec.kind === "rect"
        ? Math.min(face.sec.w / 2 - Math.abs(du), face.sec.d / 2 - Math.abs(dv))
        : face.sec.r - Math.hypot(du, dv);
      if (slack < worstSlack) { worstSlack = slack; if (!bad) worst = `${link.id} on ${link.parent}.${link.anchor}`; }
    }
  }
  ok(`all ${rig.joints.length} plugs inside their anchor face (tightest: ${worst}, ${worstSlack.toFixed(4)} to spare)`,
    bad === 0, `${bad} corners outside`);
}

// --- every joint is seated ----------------------------------------------------
section("every joint is seated");
{
  let badSeat = 0, badReach = 0, maxSeatErr = 0, maxReachErr = 0;
  for (const { link, joint, face } of rig.joints) {
    const n = vNorm(face.n);
    // measured: the anchor face -> the rotation centre
    const d = vSub(joint.centre, face.pos);
    const along = dot(d, n);
    const seatErr = Math.max(Math.abs(along - joint.seat), Math.abs(vLen(d) - joint.seat));
    if (seatErr > TOL) badSeat++;
    maxSeatErr = Math.max(maxSeatErr, seatErr);

    // measured: the rotation centre -> the child's root face, at rest
    const childPos = new THREE.Vector3()
      .setFromMatrixPosition(poseJoint(joint, {}).child).toArray();
    const reachErr = Math.abs(vLen(vSub(childPos, joint.centre)) - joint.reach);
    if (reachErr > TOL) badReach++;
    maxReachErr = Math.max(maxReachErr, reachErr);
  }
  ok(`anchor face -> centre is exactly seat, on all ${rig.joints.length} joints (max err ${maxSeatErr.toExponential(1)})`,
    badSeat === 0, `${badSeat} unseated`);
  ok(`centre -> child's root face is exactly reach, on all ${rig.joints.length} joints (max err ${maxReachErr.toExponential(1)})`,
    badReach === 0, `${badReach} out of reach`);
}

// --- every unit mesh is closed with outward normals ---------------------------
section("every unit mesh is closed with outward normals");
{
  const geos = new Set(meshes.map((m) => m.geometry));
  let bad = 0, minVol = Infinity;
  for (const g of geos) {
    const v = signedVolume(g.attributes.position.array);
    if (!(v > 0)) bad++;
    minVol = Math.min(minVol, v);
  }
  ok(`all ${geos.size} unit meshes have a positive signed volume (min ${minVol.toExponential(2)})`,
    bad === 0, `${bad} inside-out or hollow`);
}

// --- it stands on the grid ----------------------------------------------------
section("it stands on the grid");
{
  const bb = new THREE.Box3().setFromObject(rig.root);
  ok(`the lowest vertex sits on y = 0 (min.y = ${bb.min.y.toExponential(1)})`,
    Math.abs(bb.min.y) < 1e-6, `min.y = ${bb.min.y}`);
  ok(`it stands up (${bb.max.y.toFixed(3)} tall)`, bb.max.y > 1.5);
  const soles = rig.feet.map((f) => new THREE.Box3().setFromObject(f).min.y);
  ok(`both feet are on the grid (${soles.map((y) => y.toExponential(1)).join(", ")})`,
    soles.every((y) => Math.abs(y) < 1e-6));
}

// --- every mesh transform is finite -------------------------------------------
section("every mesh transform is finite");
{
  const bad = meshes.filter((m) => !finite4(m.matrixWorld) || !finite4(m.matrix));
  ok(`all ${meshes.length} mesh transforms finite at rest`, bad.length === 0,
    bad.slice(0, 3).map((m) => m.name).join(", "));
}

// --- every channel stays finite across its whole range -------------------------
section("every channel stays finite across its whole range");
{
  let bad = 0;
  for (const c of rig.channels) {
    let cbad = 0;
    for (let i = 0; i < SWEEP; i++) {
      const p = { ...rig.pose };
      p[c.key] = c.min + ((c.max - c.min) * i) / (SWEEP - 1);
      rig.setPose(p);
      rig.root.updateMatrixWorld(true);
      for (const m of meshes) if (!finite4(m.matrixWorld)) cbad++;
    }
    if (cbad) bad++;
    ok(`${c.key} [${c.min}, ${c.max}] — ${SWEEP} samples, ${meshes.length} meshes`, cbad === 0,
      `${cbad} non-finite transforms`);
  }
  // and all of them at once, at both ends
  for (const end of ["min", "max"]) {
    const p = {};
    for (const c of rig.channels) p[c.key] = c[end];
    rig.setPose(p);
    rig.root.updateMatrixWorld(true);
    const nb = meshes.filter((m) => !finite4(m.matrixWorld)).length;
    if (nb) bad++;
    ok(`every channel at its ${end} at once`, nb === 0, `${nb} non-finite transforms`);
  }
  rig.setPose(rig.pose);
  rig.root.updateMatrixWorld(true);
  ok("all channels finite across their whole range", bad === 0);
}

// --- one curl channel closes the back finger ONTO the other two ------------------
// The back finger's face points the other way, so its pin comes out reversed: the same
// channel drives it forward while the front two come back. Measured on the solids, not on
// the bones: the front digits' rearmost surface must never pass the back digit's foremost
// one (they would close straight through each other) and must reach it by the far end of
// the channel.
section("one curl channel closes the gripper (and never through itself)");
{
  const curl = rig.channels.find((c) => c.key === "fingerCurl");
  const tips = (s) => ["a", "b"].map((f) => rig.nodes[`knuckle.${s}.${f}.3`]);
  const thumb = (s) => rig.nodes[`knuckle.${s}.thumb.3`];
  let crossed = 0, closes = Infinity;
  for (let i = 0; i < SWEEP; i++) {
    const deg = curl.min + ((curl.max - curl.min) * i) / (SWEEP - 1);
    rig.setPose({ ...rig.pose, fingerCurl: deg });
    rig.root.updateMatrixWorld(true);
    for (const s of ["L", "R"]) {
      const back = new THREE.Box3().setFromObject(thumb(s)).max.z;
      for (const t of tips(s)) {
        const gap = new THREE.Box3().setFromObject(t).min.z - back;
        if (gap < -1e-9) crossed++;
        if (i === SWEEP - 1) closes = Math.min(closes, gap);
      }
    }
  }
  ok(`the two chains never pass through each other over [${curl.min}, ${curl.max}] deg`,
    crossed === 0, `${crossed} samples interpenetrating`);
  ok(`fully curled, the back finger has closed onto the front two (${closes.toFixed(3)} apart)`,
    closes >= 0 && closes < 0.03, `gap ${closes.toFixed(4)}`);
  rig.setPose(rig.pose);
}

// --- the choreographer drives it, hands only -----------------------------------
section("the choreographer drives it (hands only)");
{
  const pose = { ...rig.pose };
  const legs = ["hip", "knee"];
  const choreo = createChoreographer({
    channels: rig.choreoChannels.map((c) => ({ key: c.key, min: c.min, max: c.max })),
    pose, home: { ...pose }, seed: 1, period: 1.6,
  });
  let bad = 0, out = 0;
  for (let i = 0; i < 600; i++) {         // 600 x 1/60 s = 10 s, ~6 beats
    choreo.update(1 / 60);
    for (const c of rig.channels) {
      if (!Number.isFinite(pose[c.key])) bad++;
      if (pose[c.key] < c.min - 1e-9 || pose[c.key] > c.max + 1e-9) out++;
    }
    rig.setPose(pose);
    rig.root.updateMatrixWorld(true);
    for (const m of meshes) if (!finite4(m.matrixWorld)) bad++;
  }
  ok("600 choreographed frames: every pose value and mesh transform finite", bad === 0);
  ok("no channel driven out of its range", out === 0);
  ok("the legs never moved: hip and knee still 0", legs.every((k) => pose[k] === 0));
}

// --- the page's subject, driven the way the page drives it ----------------------
section("the page subject");
{
  const added = [];
  const scene = { add: (o) => added.push(o), remove: (o) => added.splice(added.indexOf(o), 1) };
  const s = subjects[0];
  const built = s.build(scene);
  ok(`one "${s.kind}" subject named "${s.name}", one root added to the scene`,
    subjects.length === 1 && added.length === 1);
  ok("14 sliders, 12 of them driveable, a pose for each",
    built.channels.length === 14 && built.choreoChannels.length === 12 &&
    built.channels.every((c) => Number.isFinite(built.pose[c.key])));

  // exactly what the page's frame does: choreo writes the pose, update() reads it
  const choreo = createChoreographer({
    channels: built.choreoChannels, pose: built.pose, home: { ...built.pose }, seed: 1,
  });
  let bad = 0;
  for (let i = 0; i < 240; i++) {
    choreo.update(1 / 60);
    built.update();
    for (const c of built.channels) if (!Number.isFinite(built.pose[c.key])) bad++;
  }
  ok("240 page frames: choreo -> pose -> update() stays finite", bad === 0);

  // a drag hands control back: the hand writes, the beat departs from where it left it
  choreo.reclaim("elbow");
  built.pose.elbow = -33;
  choreo.update(1 / 60);
  ok("a drag reclaims its channel (elbow held at -33 through the beat)",
    built.pose.elbow === -33, `elbow = ${built.pose.elbow}`);

  built.dispose();
  ok("dispose() takes it back out of the scene", added.length === 0);
}

// ---------------------------------------------------------------------------
console.log(`\n${failed ? "FAILED" : "PASSED"} — ${passed} ok, ${failed} failed`);
process.exit(failed ? 1 : 0);
