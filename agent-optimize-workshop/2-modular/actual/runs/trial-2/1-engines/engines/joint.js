// joint engine — mechanisms, and the seating rule.
//
// A joint is handed exactly ONE dimension source: the section of the CHILD'S PLUG.
// Every arm, tongue, pin, ball, socket and plate below is a ratio of
//
//     R = inradius(section)   W = the section across the pin   K = half across the swing
//
// so a joint can never be fatter than the limb it sits in, its two halves can never
// disagree, and `seat` / `reach` are read off the pieces just built rather than typed.
//
// Hardware is made of the modeling engine's solids only. Nothing here emits triangles.

import { extrude, lathe, cylinder, plate, inradius } from "../engines/modeling.js";

import {
  THREE, TAU, I3, vAdd, vSub, vScale, vLen, vNorm, vCross,
  m3T, translate, rotX, rotY, rotZ,
} from "../gfx.js";

// ---------------------------------------------------------------------------
// contract seam — everything this engine assumes about the modeling engine lives in
// this block, and every assumption is CHECKED against the solid that actually came
// back. A convention mismatch throws here, loudly, at the seam, instead of drifting.
// ---------------------------------------------------------------------------

const near = (a, b, tol = 1e-6) =>
  Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));

function must(cond, msg) {
  if (!cond) throw new Error(`joint: ${msg}`);
}

// a modeling call returns a HANDLE: a shared unit mesh + a rigid transform + a scale.
// `handle.mesh()` instances it. Take that instance (or a bare mesh, if a handle ever is one).
function asMesh(h) {
  const m = typeof h?.mesh === "function" ? h.mesh() : h?.isMesh ? h : h?.mesh?.isMesh ? h.mesh : null;
  must(m?.isMesh, `modeling returned a handle this engine cannot instance a mesh from (${typeof h})`);
  m.matrixAutoUpdate = false; // its matrix IS its placement; three must not rebuild it
  return m;
}

const _box = new THREE.Box3();
const _v3 = new THREE.Vector3();

// bounding box of a placed mesh, in the space its own matrix maps into
function bboxOf(mesh) {
  const g = mesh.geometry;
  must(g?.attributes?.position, "solid carries no position attribute");
  if (!g.boundingBox) g.computeBoundingBox();
  _box.copy(g.boundingBox).applyMatrix4(mesh.matrix);
  return {
    min: _box.min.toArray(),
    max: _box.max.toArray(),
    size: _box.max.clone().sub(_box.min).toArray(),
    centre: _box.getCenter(_v3).toArray(),
  };
}

// Re-origin a solid so that the ORIGIN of the outline I authored is the origin of the
// mesh. `authoredCentre` is where my authored outline's bbox centre sits in that frame.
// Measured, not assumed: this holds whether or not the modeling engine re-centres a
// solid on its own bounding box.
function reOrigin(mesh, authoredCentre = [0, 0, 0]) {
  const d = vSub(bboxOf(mesh).centre, authoredCentre);
  return translate(mesh, -d[0], -d[1], -d[2]);
}

// which axis of a solid measures `want` — i.e. the axis a sweep ran along
function axisOfExtent(size, want, what) {
  let best = -1, bestErr = Infinity;
  for (let i = 0; i < 3; i++) {
    const e = Math.abs(size[i] - want);
    if (e < bestErr) { bestErr = e; best = i; }
  }
  must(bestErr <= 1e-6 * Math.max(1, want),
    `${what}: no axis of the returned solid measures ${want} (extents ${size})`);
  return best;
}

// a cylinder with its barrel along +Y, centred. The barrel axis is detected from the
// solid itself, so the `axis` argument is a hint and never a dependency.
function cyl(r, h) {
  const m = asMesh(cylinder(r, h, "y"));
  const ax = axisOfExtent(bboxOf(m).size, h, "cylinder");
  if (ax === 0) rotZ(m, Math.PI / 2);       // barrel X -> Y
  else if (ax === 2) rotX(m, -Math.PI / 2); // barrel Z -> Y
  return reOrigin(m);
}

// a slab of `sec`, thickness along +Y, centred — plus the section's own extents.
// This is also how the engine MEASURES the plug: W and K come off the plate itself, so
// no field name of the section object is ever assumed.
function slab(sec, t) {
  const m = asMesh(plate(sec, t));
  const ax = axisOfExtent(bboxOf(m).size, t, "plate");
  if (ax === 0) rotZ(m, Math.PI / 2);       // thickness X -> Y
  else if (ax === 2) rotX(m, -Math.PI / 2); // thickness Z -> Y
  reOrigin(m);
  const s = bboxOf(m).size;
  return { mesh: m, w: s[0], d: s[2] };     // w = across the pin, d = across the swing
}

// an outline point, carried BOTH as [x, y, smooth] and as { x, y, smooth }, so either
// outline convention reads it whole. A smooth point averages its two edge normals, so
// arcs shade round while rims stay crisp.
const P = (x, y, smooth = false) => Object.assign([x, y, smooth], { x, y, smooth });

// The D-plate — knuckle at the origin, body reaching −Y, thickness along X: ONE
// extruded outline (half-circle + rectangle). The female ARM and the male TONGUE are
// THE SAME SOLID at two thicknesses, so a clevis and its tongue cannot mismatch.
function dPlate(knuckle, body, thick, seg = 24) {
  const K = knuckle;
  const o = [P(-K, -body), P(K, -body)];            // crisp bottom corners
  o.push(P(K, 0, true));                            // the rect side meets the arc tangentially
  for (let i = 1; i < seg; i++) {
    const a = (Math.PI * i) / seg;
    o.push(P(K * Math.cos(a), K * Math.sin(a), true));
  }
  o.push(P(-K, 0, true));
  const m = asMesh(extrude(o, thick));
  must(axisOfExtent(bboxOf(m).size, thick, "extrude") === 2,
    "modeling.extrude does not push the outline along Z — joint.js authors its outlines in XY");
  reOrigin(m, [0, (K - body) / 2, 0]);              // authored bbox centre; knuckle at (0,0)
  return rotY(m, Math.PI / 2);                      // outline plane -> YZ, depth -> X (det +1)
}

// a sphere: one closed lathe profile — the half-circle out and up, then straight back
// down the axis.
function sphere(r, seg = 24) {
  const o = [];
  for (let i = 0; i <= seg; i++) {
    const a = (Math.PI * i) / seg;                  // (0,−r) .. (r,0) .. (0,+r)
    o.push(P(r * Math.sin(a), -r * Math.cos(a), true));
  }
  const m = asMesh(lathe(o, TAU));
  const b = bboxOf(m).size;
  must(near(b[1], 2 * r, 1e-3) && near(b[0], b[2], 1e-3),
    "modeling.lathe does not revolve an (x = radius, y = height) profile about +Y");
  return reOrigin(m);
}

// The socket — ONE closed profile, traversed once: out along the skirt rim, up the outer
// dome, in across the top hole rim, and back down the bore that the shaft exits through.
// Revolved, that IS the cup, both cut edges capped, every normal outward. No hand-rolled
// sphere band, no full sphere.
//
// The spec's fourth leg is "back down the INNER DOME" — a double-walled cup, i.e. a
// profile with a void in it. The modeling engine refuses that outright: an outline must
// be star-shaped about its centroid (the caps are fanned from it), and a hollow profile
// never is — measured margin −1.9e-2 against the +1e-4 it demands. It is also unbuildable
// on its own numbers: the outer dome at the plate's depth measures only
// sqrt(outer² − drop²) = 0.57 R across, narrower than the 0.70 R ball, so no cavity can
// open wide enough to admit one. The cavity is invisible either way (the base plate caps
// the skirt, the shaft fills the hole), so the wall thickness lives on in the ratios and
// the asserts — which is where the spec says the fit belongs — and the profile stays
// convex, hence star-shaped at every plug size.
function socketSolid({ outer, hole, drop }, seg = 20) {
  const yTopOut = Math.sqrt(Math.max(0, outer * outer - hole * hole));
  const rSkirt = Math.sqrt(Math.max(0, outer * outer - drop * drop));
  must(rSkirt > hole, "socket skirt is narrower than its own bore");

  const a0 = Math.atan2(rSkirt, -drop);                      // the skirt rim, on the dome
  const a1 = Math.atan2(hole, yTopOut);                      // the top hole rim, on the dome
  const o = [P(hole, -drop), P(rSkirt, -drop)];              // out along the skirt rim
  for (let i = 1; i <= seg; i++) {                           // up the outer dome, to the hole rim
    const a = a0 + ((a1 - a0) * i) / seg;
    o.push(P(outer * Math.sin(a), outer * Math.cos(a), i < seg));
  }                                                          // ... and the loop closes down the bore
  const m = asMesh(lathe(o, TAU));
  return reOrigin(m, [0, (yTopOut - drop) / 2, 0]);          // ball centre at the origin
}

// ---------------------------------------------------------------------------
// frames
// ---------------------------------------------------------------------------

const FORWARD = [0, 0, 1];
const UP = [0, 1, 0];

// a row-major 3x3 whose COLUMNS are the given axes
const axes = (x, y, z) => [x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]];
const colX = (m) => [m[0], m[3], m[6]];
const colY = (m) => [m[1], m[4], m[7]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// The frame with +Y along `y`, its roll resolved from FORWARD — never from the pin. A
// pin-derived frame twists the whole chain below a corner (an arm hung off a flank would
// carry its elbow's axis round with it). Forward-built frames come out identical on both
// flanks, which is why no geometry is ever mirrored.
function frameY(y) {
  const yv = vNorm(y);
  let ref = FORWARD;
  if (Math.abs(dot(ref, yv)) > 1 - 1e-6) ref = UP;   // forward IS the axis: fall back
  const z = vNorm(vSub(ref, vScale(yv, dot(ref, yv))));
  const x = vNorm(vCross(yv, z));
  return axes(x, yv, vCross(x, yv));
}

// the bone's local axis, factored into a canonical direction and a SIGN. One channel then
// drives both flanks: a mirrored face gives a mirrored pin, the sign flips with it, and
// the motion comes out symmetric — no sign table anywhere.
function canon(a) {
  let i = 0;
  for (let k = 1; k < 3; k++) if (Math.abs(a[k]) > Math.abs(a[i])) i = k;
  const sign = a[i] < 0 ? -1 : 1;
  return { axis: vScale(a, sign).map((v) => (Math.abs(v) < 1e-12 ? 0 : v)), sign };
}

// Place a piece: it is authored in `basis` (a frame), sits at `at` IN THAT FRAME, and the
// frame itself sits at `origin` in the space the piece is reported in. Left-multiplying
// the mesh's own matrix composes in world order — no vertex work, the unit mesh is shared.
function place(mesh, basis, at = [0, 0, 0], origin = [0, 0, 0]) {
  const m = new THREE.Matrix4().set(
    basis[0], basis[1], basis[2], origin[0],
    basis[3], basis[4], basis[5], origin[1],
    basis[6], basis[7], basis[8], origin[2],
    0, 0, 0, 1,
  );
  m.multiply(new THREE.Matrix4().makeTranslation(at[0], at[1], at[2]));
  mesh.matrix.premultiply(m);
  mesh.matrixAutoUpdate = false;
  return mesh;
}

// B expressed in A's frame: Aᵀ·B, with both row-major 3x3
function inFrame(A, B) {
  const t = m3T(A), o = new Array(9);
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++)
      o[r * 3 + c] = t[r * 3] * B[c] + t[r * 3 + 1] * B[3 + c] + t[r * 3 + 2] * B[6 + c];
  return o;
}
const vecInFrame = (A, v) => [
  dot([A[0], A[3], A[6]], v), dot([A[1], A[4], A[7]], v), dot([A[2], A[5], A[8]], v),
];

// ---------------------------------------------------------------------------
// the ratio tables — the entire tuning surface
// ---------------------------------------------------------------------------

// hinge, and each stage of a universal
function hingeDims(R, W, K) {
  const arm = 0.22 * W;
  const clearance = 0.03 * W;
  const tongue = 0.50 * W;
  const d = {
    R, W, K,
    arm, clearance, tongue,
    knuckle: K,                       // inside the limb's silhouette
    body: 0.50 * K,                   // knuckle centre -> plate face
    pinR: 0.30 * Math.min(K, W / 2),
    pinOut: 0.05 * R,                 // past each arm
    plateT: 0.25 * R,
    armX: tongue / 2 + clearance + arm / 2,
  };
  d.pinLen = W + 2 * d.pinOut;
  must(near(d.tongue + 2 * d.clearance + 2 * d.arm, W, 1e-12),
    "clevis does not stack to exactly W");
  must(near(d.armX + arm / 2, W / 2, 1e-12), "arm outer face is not the section's edge");
  return d;
}

// ball
function ballDims(R) {
  const ball = 0.70 * R;
  const d = {
    R, ball,
    inner: 1.04 * ball,               // it NESTS — the surfaces are not coincident
    hole: 0.55 * ball,                // smaller than the ball, so the ball is captured
    shaft: 0.35 * ball,               // smaller than the hole, so it exits
    drop: 1.05 * ball,                // ball centre -> plate face: it clears the ball
    plateT: 0.25 * R,
  };
  d.outer = 1.28 * d.inner;           // wall 0.28 x inner -> 0.93 R, inside the limb
  d.top = d.outer;                    // the male plate rides clear over the socket rim
  must(d.hole < ball && ball < d.inner && d.inner < d.outer && d.outer <= R + 1e-12,
    "socket does not nest: hole < ball < inner < outer <= R");
  must(d.shaft < d.hole, "shaft cannot exit the hole");
  must(d.drop > ball, "plate cuts the ball");
  return d;
}

// ---------------------------------------------------------------------------
// build
// ---------------------------------------------------------------------------

const KINDS = ["hinge", "ball", "universal"];

/**
 * build(kind, anchor, section, opts)
 *
 *   anchor  — the parent's ANCHOR face { pos, n }, in the parent's part space
 *   section — the CHILD'S PLUG section: the joint's one and only dimension
 *   opts    — { aim: "along" | "against", collar: boolean, name: string }
 *
 * returns the BONES (each with a name, a local axis, a SIGN and its static rest), the
 * hardware ALREADY PLACED in the frame it belongs to (female in the parent's space — or
 * on the collar bone, which the parent's seat plate holds — male on its bone), and the
 * child's offset. A rig then computes no position and no rotation of its own.
 */
export function build(kind, anchor, section, opts = {}) {
  must(KINDS.includes(kind), `unknown mechanism "${kind}"`);
  const face = anchor?.n ? anchor : anchor?.face;
  must(face?.n && face?.pos, "build() wants the parent's anchor FACE ({ pos, n })");
  must(section != null, "build() wants the child's plug SECTION");

  const aim = opts.aim ?? "along";
  must(aim === "along" || aim === "against", `aim is "along" or "against", not "${aim}"`);

  const pre = opts.name ? `${opts.name}.` : "";
  const n = vNorm(face.n);
  const apos = face.pos;
  // every part hangs −Y, so the parent's body runs −Y: the child's body follows it, or opposes it.
  const aimDir = aim === "along" ? [0, -1, 0] : [0, 1, 0];

  // C — the child's frame: +Y = −aim, its pieces hanging −Y toward the child.
  const C = frameY(vScale(aimDir, -1));

  // The pin is ⊥ both the anchor normal and the aim. With no corner that cross degenerates
  // and the pin comes out straight through: the child's own X. (F and C then differ by a
  // half turn, so "normals oppose" falls out instead of being a rule.)
  const cr = vCross(n, aimDir);
  const corner = vLen(cr) > 1e-6;
  const pin = corner ? vNorm(cr) : colX(C);

  // F — female: +Y along the anchor normal, its pieces hanging −Y onto the parent's face.
  const F = axes(pin, n, vCross(pin, n));
  // M — male: +Y = C's +Y, so its pieces hang −Y toward the child; the pin runs through it.
  const M = axes(pin, colY(C), vCross(pin, colY(C)));

  const R = inradius(section);
  must(Number.isFinite(R) && R > 0, `inradius(section) = ${R}`);

  const probe = slab(section, 1);         // measure the plug off a plate of it
  const W = probe.w;                      // the section across the pin
  const K = probe.d / 2;                  // half the section across the swing
  must(W > 0 && K > 0, `plug section measures W=${W} K=${K}`);

  const hw = [];
  const bones = [];
  const ctx = {
    kind, section, n, aimDir, C, M, F, pin, R, W, K, pre, opts,
    bones,
    emit: (name, bone, mesh, basis, at, origin) =>
      hw.push({ name, bone, id: mesh.userData?.id, mesh: place(mesh, basis, at, origin) }),
  };

  const out = kind === "ball" ? buildBall(ctx) : buildHinged(ctx);
  const { seat, reach, childDrop, dims } = out;

  // centre = anchor.pos + anchor.n · seat.  Never place a child origin on the anchor
  // point — a joint occupies real space.
  const centre = vAdd(apos, vScale(n, seat));
  bones[0].offset = centre;                // every bone chain starts on the rotation centre
  const last = bones[bones.length - 1];

  // A bone's hardware is already in that bone's frame, which the chain puts on the centre.
  // The female pieces are reported in the PARENT's space instead, so they take the centre
  // themselves — the one and only place a coordinate is added to the static half.
  const toCentre = new THREE.Matrix4().makeTranslation(centre[0], centre[1], centre[2]);
  for (const h of hw) if (h.bone === null) h.mesh.matrix.premultiply(toCentre);

  return {
    kind, aim, corner, collar: !!opts.collar,
    seat, reach, centre, dims,
    plug: { R, W, K },
    pin,                                   // in the parent's space
    frames: { F, C, M },
    bones,                                 // [{ name, axis, sign, rest, offset }]
    hardware: hw,                          // [{ name, bone|null, mesh }]
    // the child's root face lands `reach` beyond the centre, down the child's own −Y
    child: { bone: last.name, offset: [0, -childDrop, 0], rest: I3 },
  };
}

// --- hinge / universal ------------------------------------------------------

function buildHinged(ctx) {
  const { kind, section, aimDir, C, F, M, pin, R, W, K, pre, opts, bones, emit } = ctx;
  const d = hingeDims(R, W, K);
  const { arm, tongue, body, plateT, armX, knuckle, pinR, pinLen } = d;
  const collar = !!opts.collar;

  // seat and reach are READ OFF the pieces just built — never typed. The gap between the
  // parent's surface and the child's is therefore algebraically zero.
  const seat = body + plateT + (collar ? plateT : 0);
  const reachStage = body + plateT;

  // The collar — a spin about the anchor normal: a shoulder turning in a seat plate the
  // parent holds. The parent keeps the plate; every piece below turns on the bone.
  let femaleBone = null;
  let femaleBasis = F;                          // female pieces live in F ...
  if (collar) {
    // ... or, with a collar, in the collar bone's own frame — whose rest IS F.
    bones.push({ name: `${pre}twist`, axis: [0, 1, 0], sign: 1, rest: F, offset: [0, 0, 0] });
    femaleBone = `${pre}twist`;
    femaleBasis = I3;
    // the seat plate the parent holds, flat on the anchor face, under the turning clevis
    emit("seat", null, slab(section, plateT).mesh, F, [0, -(seat - plateT / 2), 0]);
  }

  // stage 1 — female clevis: two arms, the pin, the base plate ON the parent's face
  emit("arm", femaleBone, dPlate(knuckle, body, arm), femaleBasis, [+armX, 0, 0]);
  emit("arm", femaleBone, dPlate(knuckle, body, arm), femaleBasis, [-armX, 0, 0]);
  emit("pin", femaleBone, rotZ(cyl(pinR, pinLen), Math.PI / 2), femaleBasis, [0, 0, 0]);
  emit("plate", femaleBone, slab(section, plateT).mesh, femaleBasis, [0, -(body + plateT / 2), 0]);

  // the swing bone: the pin, expressed in the child's own frame
  const sw1 = canon(vecInFrame(C, pin));
  bones.push({
    name: `${pre}swing`, axis: sw1.axis, sign: sw1.sign,
    rest: collar ? inFrame(F, C) : C, offset: [0, 0, 0],
  });
  const b1 = `${pre}swing`;
  const Cm = inFrame(C, M);                     // the male frame, expressed on the bone

  if (kind === "hinge") {
    emit("tongue", b1, dPlate(knuckle, body, tongue), Cm, [0, 0, 0]);
    emit("plate", b1, slab(section, plateT).mesh, Cm, [0, -(body + plateT / 2), 0]);
    return { seat, reach: reachStage, childDrop: reachStage, dims: d };
  }

  // --- universal: two hinges at right angles. The second's clevis hangs off the first's
  // tongue plate and they SHARE it. One joint to the caller, three bones to the rig.
  const pin2 = vNorm(vCross(aimDir, pin));      // at right angles to the first pin, ⊥ the aim
  const d12 = body + plateT + body;             // tongue body + the shared plate + clevis body

  // stage 1 male: the tongue, and the plate the second stage shares
  emit("tongue", b1, dPlate(knuckle, body, tongue), Cm, [0, 0, 0]);
  emit("plate", b1, slab(section, plateT).mesh, Cm, [0, -(body + plateT / 2), 0]);

  // stage 2 female: hung off that plate, so it rides on bone 1 — and takes NO plate of
  // its own. Its anchor normal is the aim (the shared plate's outward face).
  const F2 = axes(pin2, aimDir, vCross(pin2, aimDir));
  const CF2 = inFrame(C, F2);
  const at2 = [0, -d12, 0];                     // centre 2, in the child frame, from centre 1
  emit("arm", b1, dPlate(knuckle, body, arm), CF2, [+armX, 0, 0], at2);
  emit("arm", b1, dPlate(knuckle, body, arm), CF2, [-armX, 0, 0], at2);
  emit("pin", b1, rotZ(cyl(pinR, pinLen), Math.PI / 2), CF2, [0, 0, 0], at2);

  const sw2 = canon(vecInFrame(C, pin2));
  bones.push({ name: `${pre}swing2`, axis: sw2.axis, sign: sw2.sign, rest: I3, offset: at2 });
  const b2 = `${pre}swing2`;

  // stage 2 male: the tongue and the plate the child lands on
  const M2 = axes(pin2, colY(C), vCross(pin2, colY(C)));
  const CM2 = inFrame(C, M2);
  emit("tongue", b2, dPlate(knuckle, body, tongue), CM2, [0, 0, 0]);
  emit("plate", b2, slab(section, plateT).mesh, CM2, [0, -(body + plateT / 2), 0]);

  return {
    seat,
    reach: d12 + reachStage,                    // centre 1 -> the child's root face
    childDrop: reachStage,                      // ... of which this much hangs off bone 2
    dims: { ...d, pin2, d12, stages: 2 },
  };
}

// --- ball -------------------------------------------------------------------

function buildBall(ctx) {
  const { section, n, aimDir, C, F, M, R, pre, opts, bones, emit } = ctx;
  must(!opts.collar, "a ball already has 3 axes — it takes no collar");
  // No corner: a ball's aim must follow the normal.
  must(near(dot(n, aimDir), 1, 1e-6),
    `a ball's aim must follow the anchor normal (n·aim = ${dot(n, aimDir).toFixed(3)})`);

  const d = ballDims(R);
  const { ball, hole, shaft, drop, plateT, top } = d;

  const seat = drop + plateT;                   // socket skirt + the plate under it
  const reach = top + plateT;                   // the male plate, clear over the socket rim

  // female: the socket and the plate it stands on, both in the parent's space
  emit("socket", null, socketSolid(d), F, [0, 0, 0]);
  emit("plate", null, slab(section, plateT).mesh, F, [0, -(drop + plateT / 2), 0]);

  // three axes, one centre. The male rides the last of them, so all three turn it.
  const names = [`${pre}swing`, `${pre}bend`, `${pre}twist`];
  bones.push({ name: names[0], axis: [1, 0, 0], sign: 1, rest: C, offset: [0, 0, 0] });
  bones.push({ name: names[1], axis: [0, 0, 1], sign: 1, rest: I3, offset: [0, 0, 0] });
  bones.push({ name: names[2], axis: [0, 1, 0], sign: 1, rest: I3, offset: [0, 0, 0] });
  const last = names[2];

  const CM = inFrame(C, M);                     // = identity when there is no corner
  emit("ball", last, sphere(ball), CM, [0, 0, 0]);
  emit("shaft", last, cyl(shaft, top), CM, [0, -top / 2, 0]);   // out through the hole
  emit("plate", last, slab(section, plateT).mesh, CM, [0, -(top + plateT / 2), 0]);

  return { seat, reach, childDrop: reach, dims: d };
}

// ---------------------------------------------------------------------------
// posing — the rig's whole job, so it computes no rotation of its own
// ---------------------------------------------------------------------------

// the 4x4 of one bone at angle `deg` (its rest, then its own axis by sign · angle)
export function boneMatrix(bone, deg = 0) {
  const q = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(...bone.axis), (bone.sign * deg * Math.PI) / 180,
  );
  const rest = new THREE.Matrix4().set(
    bone.rest[0], bone.rest[1], bone.rest[2], bone.offset[0],
    bone.rest[3], bone.rest[4], bone.rest[5], bone.offset[1],
    bone.rest[6], bone.rest[7], bone.rest[8], bone.offset[2],
    0, 0, 0, 1,
  );
  return rest.multiply(new THREE.Matrix4().makeRotationFromQuaternion(q));
}

// the joint's chain composed at `pose` (a map of bone name -> degrees), as 4x4s in the
// PARENT's space: one per bone, plus `child` — the child part's root frame.
export function pose(joint, angles = {}) {
  const out = { bones: {}, list: [] };
  const acc = new THREE.Matrix4().identity();
  for (const b of joint.bones) {
    acc.multiply(boneMatrix(b, angles[b.name] ?? 0));
    const m = acc.clone();
    out.bones[b.name] = m;
    out.list.push(m);
  }
  const c = joint.child;
  out.child = acc.clone().multiply(new THREE.Matrix4().makeTranslation(
    c.offset[0], c.offset[1], c.offset[2],
  ));
  return out;
}
