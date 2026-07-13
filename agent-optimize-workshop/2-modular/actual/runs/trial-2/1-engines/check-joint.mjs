// Headless check for engines/joint.js — builds every mechanism and asserts the spec's
// own guarantees:
//
//   * a joint is SEATED: anchor -> centre measures exactly `seat`, centre -> the child's
//     root exactly `reach`, and both are read off the pieces, not typed
//   * the hardware is sized from the CHILD'S PLUG SECTION and nothing else
//   * the clevis stacks to exactly W; the socket nests; the ball is captured
//   * every bone stays finite across its whole range, and the centre never moves
//
//   run:  node check-joint.mjs
//
// If engines/modeling.js does not exist yet, the import is redirected to stub-modeling.js
// (see hooks-stub.mjs) and the run says so, loudly, at the top and the bottom.

import { register } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const HERE = new URL("./", import.meta.url);
const REAL = new URL("./engines/modeling.js", HERE);
const REAL_MODELING = existsSync(REAL);

register("./hooks-stub.mjs", HERE);

const { build, pose, boneMatrix } = await import("./engines/joint.js");
const M = await import(REAL_MODELING ? "./engines/modeling.js" : "./stub-modeling.js");
const { THREE, vSub, vLen, vNorm, vCross, vAdd, vScale } = await import("./gfx.js");

// ---------------------------------------------------------------------------

let pass = 0;
const fails = [];
const EPS = 1e-9;

function ok(name, cond, detail = "") {
  if (cond) { pass++; return true; }
  fails.push(`${name}${detail ? ` — ${detail}` : ""}`);
  return false;
}
const eq = (name, a, b, tol = 1e-9) =>
  ok(name, Math.abs(a - b) <= tol, `${a} != ${b} (tol ${tol})`);
const veq = (name, a, b, tol = 1e-9) =>
  ok(name, vLen(vSub(a, b)) <= tol, `[${a}] != [${b}]`);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

const posOf = (m4) => new THREE.Vector3().setFromMatrixPosition(m4).toArray();
const finite = (m4) => m4.elements.every(Number.isFinite);

// world-space AABB of a placed mesh (its matrix already puts it in the space it belongs to)
function bbox(mesh) {
  const g = mesh.geometry;
  if (!g.boundingBox) g.computeBoundingBox();
  const b = g.boundingBox.clone().applyMatrix4(mesh.matrix);
  return { min: b.min.toArray(), max: b.max.toArray(),
    size: b.max.clone().sub(b.min).toArray() };
}
const meshesFinite = (j) => j.hardware.every((h) =>
  h.mesh.matrix.elements.every(Number.isFinite) &&
  h.mesh.geometry.attributes.position.array.every(Number.isFinite) &&
  h.mesh.geometry.attributes.normal.array.every(Number.isFinite));

const SEC = { rect: M.rect, disc: M.disc, halfDisc: M.halfDisc };
const faceAt = (pos, n) => ({ pos, n });

// ---------------------------------------------------------------------------
// the seating rule, per mechanism: centre = anchor.pos + n·seat, and the child's root
// lands `reach` beyond the centre, down the child's own −Y.
// ---------------------------------------------------------------------------

function checkSeated(tag, j, anchor) {
  const n = vNorm(anchor.n);
  const aimDir = j.aim === "along" ? [0, -1, 0] : [0, 1, 0];

  veq(`${tag}: centre = anchor.pos + n·seat`, j.centre, vAdd(anchor.pos, vScale(n, j.seat)), 1e-12);
  eq(`${tag}: |anchor -> centre| == seat`, vLen(vSub(j.centre, anchor.pos)), j.seat, 1e-12);
  ok(`${tag}: the child's origin is not ON the anchor point`, j.seat > 0);

  const p = pose(j, {});
  const root = posOf(p.child);
  eq(`${tag}: |centre -> child root| == reach`, vLen(vSub(root, j.centre)), j.reach, 1e-12);
  veq(`${tag}: the child's root lands down the aim`, root, vAdd(j.centre, vScale(aimDir, j.reach)), 1e-12);

  // the child's frame: its +Y is −aim, so its body hangs toward the child
  const cy = new THREE.Vector3(0, 1, 0).applyMatrix4(
    new THREE.Matrix4().extractRotation(p.child)).toArray();
  veq(`${tag}: the child's +Y = −aim`, cy, vScale(aimDir, -1), 1e-9);

  ok(`${tag}: every hardware mesh is finite`, meshesFinite(j));
  ok(`${tag}: every bone rest is finite`, j.bones.every((b) =>
    b.rest.every(Number.isFinite) && b.axis.every(Number.isFinite) &&
    b.offset.every(Number.isFinite) && Math.abs(b.sign) === 1));
}

// every bone stays finite across its range, and no bone moves the rotation centre
function checkRange(tag, j) {
  const centre0 = posOf(pose(j, {}).list[0]);
  let bad = 0, moved = 0;
  for (const b of j.bones) {
    for (let deg = -180; deg <= 180; deg += 5) {
      const p = pose(j, { [b.name]: deg });
      if (!p.list.every(finite) || !finite(p.child)) bad++;
      if (!Number.isFinite(vLen(posOf(p.child)))) bad++;
      // bone 0 carries the centre; turning ANY bone must leave that centre alone
      if (vLen(vSub(posOf(p.list[0]), centre0)) > 1e-12) moved++;
    }
  }
  ok(`${tag}: every bone finite across ±180°`, bad === 0, `${bad} non-finite poses`);
  ok(`${tag}: the rotation centre never moves`, moved === 0, `${moved} drifted poses`);

  // all-bones-at-once, a few random poses
  let bad2 = 0;
  for (let i = 0; i < 64; i++) {
    const a = {};
    for (const b of j.bones) a[b.name] = (Math.random() * 2 - 1) * 180;
    const p = pose(j, a);
    if (!p.list.every(finite) || !finite(p.child)) bad2++;
  }
  ok(`${tag}: finite under random full poses`, bad2 === 0);
}

// ---------------------------------------------------------------------------

const secW = 0.8, secD = 0.5;                       // W = 0.8, K = 0.25, R = 0.25
const RECT = SEC.rect(secW, secD);
const A_BOTTOM = faceAt([0, -1, 0], [0, -1, 0]);    // the parent's bottom face
const A_LEFT = faceAt([0.6, -0.2, 0], [1, 0, 0]);   // a flank: a corner
const A_RIGHT = faceAt([-0.6, -0.2, 0], [-1, 0, 0]);// the mirrored flank

console.log(REAL_MODELING
  ? "modeling: engines/modeling.js — THE REAL ENGINE"
  : "modeling: engines/modeling.js ABSENT -> stub-modeling.js (contract-only stub)");

// --- 1. hinge ---------------------------------------------------------------
{
  const j = build("hinge", A_BOTTOM, RECT, { aim: "along", name: "elbow" });
  const d = j.dims;
  checkSeated("hinge", j, A_BOTTOM);
  checkRange("hinge", j);

  eq("hinge: R = inradius(section)", j.plug.R, Math.min(secW, secD) / 2);
  eq("hinge: W = the section across the pin", j.plug.W, secW, 1e-6);
  eq("hinge: K = half the section across the swing", j.plug.K, secD / 2, 1e-6);

  // the ratio table
  eq("hinge: arm = 0.22 W", d.arm, 0.22 * secW);
  eq("hinge: clearance = 0.03 W", d.clearance, 0.03 * secW);
  eq("hinge: tongue = 0.50 W", d.tongue, 0.50 * secW);
  eq("hinge: knuckle = K", d.knuckle, j.plug.K);
  eq("hinge: body = 0.50 K", d.body, 0.50 * j.plug.K);
  eq("hinge: pin r = 0.30 min(K, W/2)", d.pinR, 0.30 * Math.min(j.plug.K, secW / 2));
  eq("hinge: base plate = 0.25 R", d.plateT, 0.25 * j.plug.R);
  eq("hinge: tongue + 2·clearance + 2·arm = W", d.tongue + 2 * d.clearance + 2 * d.arm, secW, 1e-12);

  // seat and reach are READ OFF the pieces: body + plate
  eq("hinge: seat = body + plate", j.seat, d.body + d.plateT, 1e-12);
  eq("hinge: reach = body + plate", j.reach, d.body + d.plateT, 1e-12);

  // one bone, straight through the child's own X
  ok("hinge: 1 bone", j.bones.length === 1, `${j.bones.length}`);
  veq("hinge: the bone's axis is the child's X", j.bones[0].axis, [1, 0, 0]);
  ok("hinge: the pin ⊥ the anchor normal", Math.abs(dot(j.pin, A_BOTTOM.n)) < 1e-12);

  // the hardware — female in the parent's space, male on the bone
  const female = j.hardware.filter((h) => h.bone === null);
  const male = j.hardware.filter((h) => h.bone !== null);
  ok("hinge: female is in the parent's space", female.length === 4,
    female.map((h) => h.name).join(","));                       // 2 arms + pin + plate
  ok("hinge: male is on the bone", male.length === 2 && male.every((h) => h.bone === "elbow.swing"),
    male.map((h) => h.name).join(","));

  // the base plate IS the section, and it lands on the anchor face: never proud, never sunk
  const fplate = female.find((h) => h.name === "plate");
  const fb = bbox(fplate.mesh);
  eq("hinge: the female plate lands ON the anchor face", fb.max[1], A_BOTTOM.pos[1], 1e-12);
  eq("hinge: the female plate IS the section (across the pin)", fb.size[0], secW, 1e-6);
  eq("hinge: the female plate IS the section (across the swing)", fb.size[2], secD, 1e-6);
  eq("hinge: the female plate is 0.25 R thick", fb.size[1], d.plateT, 1e-9);

  // the two arms stack to exactly W along the pin, and stay inside the limb
  const arms = female.filter((h) => h.name === "arm").map((h) => bbox(h.mesh));
  const lo = Math.min(...arms.map((b) => b.min[0])), hi = Math.max(...arms.map((b) => b.max[0]));
  eq("hinge: the clevis spans exactly W", hi - lo, secW, 1e-9);
  eq("hinge: the arms sit inside the limb (−W/2)", lo, -secW / 2, 1e-9);
  eq("hinge: the arms sit inside the limb (+W/2)", hi, secW / 2, 1e-9);
  arms.forEach((b, i) => eq(`hinge: arm ${i} is 0.22 W thick`, b.size[0], d.arm, 1e-9));
  arms.forEach((b, i) => eq(`hinge: arm ${i} knuckle = K`, b.size[2], 2 * d.knuckle, 1e-6));

  // the tongue is the SAME SOLID as an arm, at tongue thickness, centred in the clearance
  const tongue = bbox(male.find((h) => h.name === "tongue").mesh);
  eq("hinge: the tongue is 0.50 W thick", tongue.size[0], d.tongue, 1e-9);
  eq("hinge: the tongue is the same solid as an arm (swing)", tongue.size[2], 2 * d.knuckle, 1e-6);
  eq("hinge: the tongue is centred on the pin", (tongue.min[0] + tongue.max[0]) / 2, 0, 1e-9);
  const left = arms.find((b) => b.max[0] < 0), right = arms.find((b) => b.min[0] > 0);
  eq("hinge: clearance, tongue to the -X arm", tongue.min[0] - left.max[0], d.clearance, 1e-9);
  eq("hinge: clearance, tongue to the +X arm", right.min[0] - tongue.max[0], d.clearance, 1e-9);

  // the pin protrudes 0.05 R past each arm
  const pinb = bbox(female.find((h) => h.name === "pin").mesh);
  eq("hinge: the pin protrudes 0.05 R past each arm", pinb.size[0], secW + 2 * 0.05 * j.plug.R, 1e-9);
  eq("hinge: the pin radius", pinb.size[1] / 2, d.pinR, 1e-6);

  // the male plate's far face IS the child's root face
  const mplate = bbox(male.find((h) => h.name === "plate").mesh);
  const root = posOf(pose(j, {}).child);
  eq("hinge: the male plate's far face = the child's root", mplate.min[1] + j.centre[1], root[1], 1e-9);
}

// --- 2. hinge + collar ------------------------------------------------------
{
  const j = build("hinge", A_BOTTOM, RECT, { collar: true, name: "shoulder" });
  const d = j.dims;
  checkSeated("collar", j, A_BOTTOM);
  checkRange("collar", j);

  ok("collar: 2 bones (twist, swing)", j.bones.length === 2, j.bones.map((b) => b.name).join(","));
  veq("collar: the twist spins about the anchor normal", j.bones[0].axis, [0, 1, 0]);
  eq("collar: seat grew by the seat plate", j.seat, d.body + 2 * d.plateT, 1e-12);

  // the seat plate is the ONLY piece the parent still holds; the clevis turns on the bone
  const stat = j.hardware.filter((h) => h.bone === null);
  ok("collar: the parent holds only the seat plate",
    stat.length === 1 && stat[0].name === "seat", stat.map((h) => h.name).join(","));
  const sb = bbox(stat[0].mesh);
  eq("collar: the seat plate lands ON the anchor face", sb.max[1], A_BOTTOM.pos[1], 1e-12);
  ok("collar: the clevis turns on the twist bone",
    j.hardware.filter((h) => h.bone === "shoulder.twist").length === 4);

  // spinning the collar must not move the centre, and must carry the whole hinge with it
  const p90 = pose(j, { "shoulder.twist": 90 });
  ok("collar: a spin keeps the child on the aim",
    Math.abs(posOf(p90.child)[1] - (j.centre[1] - j.reach)) < 1e-9);
}

// --- 3. aim: "against" (a corner expressed by aiming) ------------------------
{
  const j = build("hinge", A_BOTTOM, RECT, { aim: "against" });
  checkSeated("against", j, A_BOTTOM);
  checkRange("against", j);
  const root = posOf(pose(j, {}).child);
  ok("against: the child's body opposes the parent's", root[1] > j.centre[1]);
  eq("against: still seated by the same rule", vLen(vSub(j.centre, A_BOTTOM.pos)), j.seat, 1e-12);
}

// --- 4. a flank corner, and the mirrored flank ------------------------------
{
  const L = build("hinge", A_LEFT, RECT, { aim: "along", name: "armL" });
  const R = build("hinge", A_RIGHT, RECT, { aim: "along", name: "armR" });
  checkSeated("flank", L, A_LEFT);
  checkSeated("flank(mirror)", R, A_RIGHT);
  checkRange("flank", L);

  const aim = [0, -1, 0];
  ok("flank: the pin ⊥ the anchor normal", Math.abs(dot(L.pin, vNorm(A_LEFT.n))) < 1e-12);
  ok("flank: the pin ⊥ the aim", Math.abs(dot(L.pin, aim)) < 1e-12);
  ok("flank: a mirrored face gives a mirrored pin",
    vLen(vAdd(L.pin, R.pin)) < 1e-12, `[${L.pin}] vs [${R.pin}]`);

  // the forward-built child frame does NOT carry the corner into the chain below: the
  // child's own axes come out the same on both flanks (no mirrored geometry, no twist)
  veq("flank: the child frame is identical on both flanks", L.frames.C, R.frames.C, 1e-12);

  // one channel, both flanks: the SIGN makes the motion symmetric
  const dL = vSub(posOf(pose(L, { "armL.swing": 30 }).child), L.centre);
  const dR = vSub(posOf(pose(R, { "armR.swing": 30 }).child), R.centre);
  ok("flank: one channel drives both flanks symmetrically",
    Math.abs(dL[0] + dR[0]) < 1e-9 && Math.abs(dL[1] - dR[1]) < 1e-9,
    `[${dL}] vs [${dR}]`);
}

// --- 5. ball ----------------------------------------------------------------
{
  const sec = SEC.disc(0.4);
  const j = build("ball", A_BOTTOM, sec, { name: "hip" });
  const d = j.dims;
  const R = j.plug.R;
  checkSeated("ball", j, A_BOTTOM);
  checkRange("ball", j);

  eq("ball: R = inradius(disc)", R, 0.4);
  eq("ball: ball = 0.70 R", d.ball, 0.70 * R);
  eq("ball: socket inner = 1.04 × ball", d.inner, 1.04 * d.ball);
  eq("ball: socket outer = 0.93 R", d.outer, 1.28 * 1.04 * 0.70 * R, 1e-9);
  eq("ball: shaft hole = 0.55 × ball", d.hole, 0.55 * d.ball);
  eq("ball: shaft = 0.35 × ball", d.shaft, 0.35 * d.ball);
  eq("ball: drop = 1.05 × ball", d.drop, 1.05 * d.ball);
  ok("ball: hole < ball < inner < outer <= R",
    d.hole < d.ball && d.ball < d.inner && d.inner < d.outer && d.outer <= R + 1e-12);
  ok("ball: shaft < hole", d.shaft < d.hole);
  ok("ball: drop > ball", d.drop > d.ball);
  eq("ball: seat = drop + plate", j.seat, d.drop + d.plateT, 1e-12);
  eq("ball: reach = top + plate", j.reach, d.top + d.plateT, 1e-12);

  ok("ball: 3 axes", j.bones.length === 3, j.bones.map((b) => b.name).join(","));
  const ax = j.bones.map((b) => b.axis);
  ok("ball: the three axes are independent",
    Math.abs(dot(ax[0], ax[1])) < 1e-12 && Math.abs(dot(ax[1], ax[2])) < 1e-12 &&
    Math.abs(dot(ax[0], ax[2])) < 1e-12);

  // the socket is one lathe, inside the limb, and it clears the ball
  const socket = j.hardware.find((h) => h.name === "socket");
  const sb = bbox(socket.mesh);
  ok("ball: the socket is in the parent's space", socket.bone === null);
  eq("ball: the socket is inside the limb (outer <= R)", sb.size[0] / 2, d.outer, 1e-3);
  ok("ball: the socket's outer radius <= R", sb.size[0] / 2 <= R + 1e-9);
  // the anchor looks down −Y, so the socket's face toward the parent is its bbox max
  eq("ball: the socket's skirt sits on the plate face",
    dot(vSub([0, sb.max[1], 0], [0, j.centre[1], 0]), A_BOTTOM.n), -d.drop, 1e-9);
  eq("ball: the plate's far face is the anchor face",
    bbox(j.hardware.filter((h) => h.bone === null).find((h) => h.name === "plate").mesh).max[1],
    A_BOTTOM.pos[1], 1e-12);

  const ballb = bbox(j.hardware.find((h) => h.name === "ball").mesh);
  eq("ball: the ball is centred on the rotation centre", (ballb.min[1] + ballb.max[1]) / 2, 0, 1e-9);
  eq("ball: the ball's radius", ballb.size[1] / 2, d.ball, 1e-3);
  const shaft = bbox(j.hardware.find((h) => h.name === "shaft").mesh);
  ok("ball: the shaft exits the hole", shaft.size[0] / 2 < d.hole);
  ok("ball: the ball is captured by the hole", ballb.size[0] / 2 > d.hole);

  // a ball has no corner: its aim must follow the normal
  let threw = false;
  try { build("ball", A_LEFT, sec, {}); } catch { threw = true; }
  ok("ball: a corner is refused (its aim must follow the normal)", threw);
}

// --- 6. universal -----------------------------------------------------------
{
  const j = build("universal", A_BOTTOM, RECT, { name: "wrist" });
  const d = j.dims;
  checkSeated("universal", j, A_BOTTOM);
  checkRange("universal", j);

  ok("universal: 2 bones (3 with a collar)", j.bones.length === 2, j.bones.map((b) => b.name).join(","));
  const jc = build("universal", A_BOTTOM, RECT, { name: "w2", collar: true });
  ok("universal: a collar adds a third bone", jc.bones.length === 3);
  checkSeated("universal+collar", jc, A_BOTTOM);
  checkRange("universal+collar", jc);

  ok("universal: the two hinges are at right angles",
    Math.abs(dot(j.pin, d.pin2)) < 1e-12, `${dot(j.pin, d.pin2)}`);
  ok("universal: both pins are ⊥ the aim",
    Math.abs(dot(j.pin, [0, -1, 0])) < 1e-12 && Math.abs(dot(d.pin2, [0, -1, 0])) < 1e-12);

  // the second's clevis hangs off the first's tongue plate and they SHARE it:
  // 3 plates, not 4 (female base, the shared one, the male base)
  const plates = j.hardware.filter((h) => h.name === "plate");
  ok("universal: the middle plate is SHARED", plates.length === 3,
    `${plates.length} plates: ${plates.map((h) => h.bone).join(",")}`);
  eq("universal: seat = body + plate", j.seat, d.body + d.plateT, 1e-12);
  eq("universal: reach = 3·body + 2·plate", j.reach, 3 * d.body + 2 * d.plateT, 1e-12);
  eq("universal: centre1 -> centre2 = body + plate + body", d.d12, 2 * d.body + d.plateT, 1e-12);

  // both stages are made of the SAME solids at the same ratios
  const arms = j.hardware.filter((h) => h.name === "arm");
  ok("universal: two clevises, four arms", arms.length === 4);
  ok("universal: two tongues", j.hardware.filter((h) => h.name === "tongue").length === 2);
  ok("universal: two pins", j.hardware.filter((h) => h.name === "pin").length === 2);
  arms.forEach((h, i) => eq(`universal: arm ${i} is 0.22 W`, bbox(h.mesh).size[0] <= secW ? d.arm : -1, d.arm, 1e-9));

  // bending stage 2 alone must not move stage 1's centre or stage 2's centre
  const p = pose(j, { "wrist.swing2": 45 });
  ok("universal: bending stage 2 leaves centre 1 alone",
    vLen(vSub(posOf(p.list[0]), j.centre)) < 1e-12);
  ok("universal: bending stage 2 leaves centre 2 alone",
    vLen(vSub(posOf(p.list[1]), vAdd(j.centre, [0, -d.d12, 0]))) < 1e-12);
}

// --- 7. the hardware is sized from the plug, and from nothing else -----------
{
  const a = build("hinge", A_BOTTOM, SEC.rect(secW, secD), {});
  const b = build("hinge", A_BOTTOM, SEC.rect(2 * secW, 2 * secD), {});
  for (const k of ["arm", "clearance", "tongue", "knuckle", "body", "pinR", "pinLen", "plateT"])
    eq(`scale: ${k} doubles with the plug`, b.dims[k], 2 * a.dims[k], 1e-9);
  eq("scale: seat doubles with the plug", b.seat, 2 * a.seat, 1e-12);
  eq("scale: reach doubles with the plug", b.reach, 2 * a.reach, 1e-12);

  // a joint cannot be fatter than the limb it sits in
  for (const [tag, j, w, dd] of [["1x", a, secW, secD], ["2x", b, 2 * secW, 2 * secD]]) {
    const solid = j.hardware.filter((h) => h.name !== "pin");   // the pin protrudes by design
    const wide = solid.map((h) => bbox(h.mesh));
    ok(`scale(${tag}): no piece is wider than the limb across the pin`,
      wide.every((x) => x.size[0] <= w + 1e-9));
    ok(`scale(${tag}): no piece is wider than the limb across the swing`,
      wide.every((x) => x.size[2] <= dd + 1e-9));
  }

  // a disc plug and a rect plug of the same inradius give the same R-derived pieces
  const c = build("hinge", A_BOTTOM, SEC.disc(secD / 2), {});
  eq("plug: a disc of the same inradius gives the same plate", c.dims.plateT, a.dims.plateT, 1e-12);
  ok("plug: but its W follows its own section", Math.abs(c.plug.W - a.plug.W) > 1e-6);
}

// --- 8. bad input crashes, it is not repaired -------------------------------
{
  const bad = [
    ["unknown mechanism", () => build("weld", A_BOTTOM, RECT, {})],
    ["a bad aim word", () => build("hinge", A_BOTTOM, RECT, { aim: "sideways" })],
    ["no section", () => build("hinge", A_BOTTOM, null, {})],
    ["no anchor face", () => build("hinge", { pos: [0, 0, 0] }, RECT, {})],
  ];
  for (const [tag, fn] of bad) {
    let threw = false;
    try { fn(); } catch { threw = true; }
    ok(`refuses: ${tag}`, threw);
  }
}

// --- 9. a rig built the ONLY way a rig builds one: gfx.group(offset, rest) nodes, posed
//        by turning each bone about its own local axis by SIGN x degrees. It must land in
//        exactly the same place as the joint's own pose() — no rig-side math, ever.
{
  const { group } = await import("./gfx.js");
  for (const [kind, sec, opts] of [
    ["hinge", RECT, { name: "e" }],
    ["hinge", RECT, { name: "e", collar: true }],
    ["ball", SEC.disc(0.4), { name: "h" }],
    ["universal", RECT, { name: "w", collar: true }],
  ]) {
    const j = build(kind, A_BOTTOM, sec, opts);
    const root = new THREE.Group();
    const nodes = {};
    let node = root;
    for (const b of j.bones) node = nodes[b.name] = group(node, b.offset, b.rest);
    const child = group(node, j.child.offset, j.child.rest);

    const angles = {};
    j.bones.forEach((b, i) => (angles[b.name] = [37, -64, 128][i % 3]));
    for (const b of j.bones)
      nodes[b.name].quaternion.setFromAxisAngle(
        new THREE.Vector3(...b.axis), (b.sign * angles[b.name] * Math.PI) / 180);
    root.updateMatrixWorld(true);

    const rigged = new THREE.Vector3().setFromMatrixPosition(child.matrixWorld).toArray();
    const said = posOf(pose(j, angles).child);
    veq(`rig(${kind}${opts.collar ? "+collar" : ""}): the scene graph lands where pose() says`,
      rigged, said, 1e-9);
  }
}

// --- 10. the demo wiring: a rig hangs the chain and computes nothing itself --
{
  const { subjects } = await import("./demo-joints.js");
  ok("demo: a joints tab per mechanism", subjects.length >= 3 &&
    subjects.every((s) => s.kind === "joints"));

  for (const s of subjects) {
    const scene = new THREE.Scene();
    let built;
    try { built = s.build(scene); } catch (e) { ok(`demo(${s.name}): builds`, false, e.message); continue; }
    ok(`demo(${s.name}): builds`, true);
    ok(`demo(${s.name}): has a plug slider`, built.channels.some((c) => c.key === "plug"));
    ok(`demo(${s.name}): has a slider per bone`, built.channels.length >= 2);

    // sweep every channel, including the plug: the hardware must resize and stay finite
    let bad = 0;
    for (const c of built.channels) {
      for (let t = 0; t <= 1.0001; t += 0.25) {
        built.pose[c.key] = c.min + (c.max - c.min) * t;
        built.update();
        scene.updateMatrixWorld(true);
        scene.traverse((o) => { if (!o.matrixWorld.elements.every(Number.isFinite)) bad++; });
      }
      built.pose[c.key] = c.key === "plug" ? 1 : 0;
    }
    ok(`demo(${s.name}): finite through every slider's range`, bad === 0, `${bad} bad nodes`);
    built.dispose();
    ok(`demo(${s.name}): disposes`, scene.children.length === 0);
  }
}

// ---------------------------------------------------------------------------

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) {
  for (const f of fails) console.log(`  FAIL  ${f}`);
  console.log(REAL_MODELING ? "" : "\n(ran against stub-modeling.js — engines/modeling.js was absent)");
  process.exit(1);
}
console.log(REAL_MODELING
  ? "joint engine OK against the REAL engines/modeling.js"
  : "joint engine OK against stub-modeling.js (engines/modeling.js was absent)");
