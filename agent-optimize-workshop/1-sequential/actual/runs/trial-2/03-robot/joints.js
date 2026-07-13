// Joint catalog: hinge1, hinge2, ball1 (for future reuse) + the exported
// mount-to-mount hinge (not a catalog entry). Every mechanism is authored
// around its own local origin (the pin axis, or the ball center) and split
// into channels: pieces tagged by which pose axis moves them.
//
// primitives.js's rotX/rotY/rotZ POST-multiply (rotate happens inside the
// handle's existing scale in the matrix product), which is only shape-
// preserving for isotropic handles. Verified empirically: rotating an
// anisotropic box(2,1,1) that way shears it instead of rigidly turning it.
// So all reorientation here goes through `rotPiece`, a PRE-multiply rotation
// about an external pivot (world-space rigid rotation, shape-preserving for
// any handle, and the correct operation for "rotate this fully-authored
// piece about the joint pivot" pose semantics anyway).
import { m3Mul, m3Rot, m3MulV, vAdd, vSub } from "./math.js";
import { box, cylinder, sphere, cutHemisphere, collect } from "./primitives.js";

// ---- rigid-body helpers ----------------------------------------------------

function rotPiece(h, axis, angle, pivot = [0, 0, 0]) {
  if (!angle) return h;
  const R = m3Rot(axis, angle);
  return { ...h, m: m3Mul(R, h.m), t: vAdd(pivot, m3MulV(R, vSub(h.t, pivot))) };
}
const tag = (h, channel) => ({ ...h, channel });

function boxAt(w, h, d, center) {
  return { ...box(w, h, d), t: center };
}
// flat disc, centered vertically at `center` (cylinder() bases at local y=0)
function discAt(r, h, center) {
  return { ...cylinder(r, h), t: [center[0], center[1] - h / 2, center[2]] };
}
// cylinder whose axis runs along world +X, starting at `base`, length `len`
function cylAlongX(r, len, base) {
  const c = cylinder(r, len);
  return { ...c, m: m3Mul(m3Rot("z", -Math.PI / 2), c.m), t: base };
}

// ==========================================================================
// hinge1 — pin along X, narrow U nested inside a wide U with clearance,
// arms interleaved (F, M, M, F along the pin), one pin through all four
// knuckles. Female opens down (base above, arms hang to the pin at y=0),
// male opens up (base below, arms rise to the pin). ONE place computes every
// derived measurement — gap widths, knuckle radii, bridge offsets, pin
// half-length — so joints.js and slots.js can never drift apart.
// ==========================================================================

export function hinge1Dims(p = {}) {
  const pinR = p.pinR ?? 0.045;
  const knuckleR = p.knuckleR ?? 0.085;
  const knuckleLen = p.knuckleLen ?? 0.15;
  const kgap = p.gap ?? 0.02; // clearance between adjacent knuckle faces
  const armT = p.armT ?? 0.11; // arm/tongue thickness (Z)
  const reach = p.reach ?? 0.42; // pin (y=0) to base plate inner face
  const baseT = p.baseT ?? 0.06;
  const baseMargin = p.baseMargin ?? 0.06;
  const baseD = p.baseD ?? 0.36;
  const pinOverhang = p.pinOverhang ?? 0.05; // bare shaft past the outer knuckle face
  const tongue = !!p.tongue; // solid tongue instead of the male U
  const femaleBase = p.femaleBase ?? "rect"; // 'rect' | 'disc' | 'none'
  const maleBase = p.maleBase ?? "rect";

  // knuckle X-spans, center outward: inner (male) block, then outer (female)
  const innerR1 = kgap / 2 + knuckleLen; // right edge of the inner (male/tongue) block
  const innerR0 = tongue ? -innerR1 : kgap / 2; // tongue spans the whole inner block
  const femR0 = innerR1 + kgap, femR1 = femR0 + knuckleLen;
  const outerEdge = femR1;
  const pinHalfLen = outerEdge + pinOverhang;
  const baseWmale = 2 * innerR1 + 2 * baseMargin;
  const baseWfemale = 2 * outerEdge + 2 * baseMargin;
  const femaleBaseY = reach + baseT / 2;
  const maleBaseY = -(reach + baseT / 2);

  return {
    pinR, knuckleR, knuckleLen, kgap, armT, reach, baseT, baseMargin, baseD,
    pinOverhang, tongue, femaleBase, maleBase,
    innerR0, innerR1, femR0, femR1, outerEdge, pinHalfLen,
    baseWmale, baseWfemale, femaleBaseY, maleBaseY,
  };
}

// Raw (unposed) pieces, split into the two halves. Every piece sits at its
// final REST position already (absolute t), so posing only needs one rigid
// rotation about the pin — no turtle-chain to keep in sync.
export function buildHinge1Raw(d) {
  const fixed = [];
  const male = [];

  // female (wide U): knuckles far from center, arms rise from y=0 to y=+reach
  for (const s of [1, -1]) {
    const x0 = s > 0 ? d.femR0 : -d.femR1;
    fixed.push(cylAlongX(d.knuckleR, d.knuckleLen, [x0, 0, 0]));
    fixed.push(boxAt(d.knuckleLen, d.reach, d.armT, [s * (d.femR0 + d.femR1) / 2, d.reach / 2, 0]));
  }
  if (d.femaleBase === "rect") fixed.push(boxAt(d.baseWfemale, d.baseT, d.baseD, [0, d.femaleBaseY, 0]));
  else if (d.femaleBase === "disc") fixed.push(discAt(d.baseWfemale / 2, d.baseT, [0, d.femaleBaseY, 0]));

  // shared pin, bare shaft overhanging both outer knuckle faces
  fixed.push(cylAlongX(d.pinR, 2 * d.pinHalfLen, [-d.pinHalfLen, 0, 0]));

  // male (narrow U, or a solid tongue): knuckles near center, arms drop from
  // y=0 to y=-reach
  if (d.tongue) {
    male.push(cylAlongX(d.knuckleR, d.innerR1 - d.innerR0, [d.innerR0, 0, 0]));
    male.push(boxAt(d.innerR1 - d.innerR0, d.reach, d.armT, [0, -d.reach / 2, 0]));
  } else {
    for (const s of [1, -1]) {
      const x0 = s > 0 ? d.kgap / 2 : -d.innerR1;
      male.push(cylAlongX(d.knuckleR, d.knuckleLen, [x0, 0, 0]));
      male.push(boxAt(d.knuckleLen, d.reach, d.armT, [s * (d.kgap / 2 + d.innerR1) / 2, -d.reach / 2, 0]));
    }
  }
  if (d.maleBase === "rect") male.push(boxAt(d.baseWmale, d.baseT, d.baseD, [0, d.maleBaseY, 0]));
  else if (d.maleBase === "disc") male.push(discAt(d.baseWmale / 2, d.baseT, [0, d.maleBaseY, 0]));

  return { fixed, male };
}

// swing: the whole male half, about the pin (X) through the origin.
export function hinge1(params = {}, pose = {}) {
  const d = hinge1Dims(params);
  const { fixed, male } = buildHinge1Raw(d);
  const swing = pose.swing ?? 0;
  return [
    ...fixed.map((h) => tag(h, "fixed")),
    ...male.map((h) => tag(rotPiece(h, "x", swing), "swing")),
  ];
}

// ==========================================================================
// hinge2 — one hinge1 stage, then a second directly below it, pin turned
// from X to Z. The upper male carries no base of its own; the lower
// female's base is the single plate between them, so the two stages nest
// with no gap. The two pins sit at different Y and never meet.
// ==========================================================================

export function hinge2Dims(params = {}) {
  const { upper: uOv = {}, lower: lOv = {}, ...shared } = params;
  const upper = hinge1Dims({ ...shared, ...uOv, maleBase: "none" });
  const lower = hinge1Dims({ ...shared, ...lOv });
  const pin2Y = -(upper.reach + lower.baseT + lower.reach);
  return { upper, lower, pin2Y };
}

// rigidly turn a lower-stage piece's pin from X to Z (about the stage's own
// origin) and drop it to the second pin's height
function toLowerStage(h, pin2Y) {
  const r = rotPiece(h, "y", -Math.PI / 2); // local +X pin -> +Z pin
  return { ...r, t: vAdd(r.t, [0, pin2Y, 0]) };
}

// rx: upper male, and the whole lower stage rides it (about the origin).
// rz: lower male only (about the lower pin, applied before rx so it chains).
export function hinge2(params = {}, pose = {}) {
  const { upper, lower, pin2Y } = hinge2Dims(params);
  const rx = pose.rx ?? 0, rz = pose.rz ?? 0;
  const up = buildHinge1Raw(upper);
  const lo = buildHinge1Raw(lower);
  const out = [];
  for (const h of up.fixed) out.push(tag(h, "fixed"));
  for (const h of up.male) out.push(tag(rotPiece(h, "x", rx), "rx"));
  for (const h of lo.fixed) out.push(tag(rotPiece(toLowerStage(h, pin2Y), "x", rx), "rx"));
  for (const h of lo.male) {
    const spun = rotPiece(toLowerStage(h, pin2Y), "z", rz, [0, pin2Y, 0]);
    out.push(tag(rotPiece(spun, "x", rx), "rz"));
  }
  return out;
}

// ==========================================================================
// ball1 — ball center = origin. genCutHemisphere covers AT MOST one
// hemisphere measured from ITS OWN equator (its local y=0, the flat rim) up
// to the opening — it can never wrap past its own equator. So to make the
// dome wrap past the BALL's equator while also fully containing the ball
// from below, the cavity has to be a good deal bigger than the ball (a
// deep, loose socket, not a snug clearance fit): drop the shell's own rim
// below the ball's lowest point (bottomMargin), pick how far past the
// ball's equator the opening should sit (domeReach), and size the cavity to
// exactly deliver that cut height for the chosen opening size — derived,
// not guessed, so it can't quietly go infeasible for other ballR/wallT.
// ==========================================================================

export function ball1Dims(p = {}) {
  const ballR = p.ballR ?? 0.3;
  const wallT = p.wallT ?? 0.13;
  const openFrac = p.openFrac ?? 0.25; // opening radius, as a fraction of the cavity radius
  const bottomMarginFrac = p.bottomMarginFrac ?? 0.06; // shell rim past the ball's bottom pole
  const domeReachFrac = p.domeReachFrac ?? 0.68; // how far past the equator the opening sits (of ballR)

  const dropBelow = ballR * (1 + bottomMarginFrac);
  const domeTopY = ballR * domeReachFrac; // world y of the opening's rim — > 0 by construction
  const cutY = dropBelow + domeTopY; // shell-local height of the cut
  const cavityR = cutY / Math.cos(Math.asin(openFrac)); // sized so this cutY needs exactly this openFrac
  const outerR = cavityR / (1 - wallT);
  const cutParam = cutY / outerR;
  const openR = cavityR * openFrac;
  const bottomMargin = ballR * bottomMarginFrac;
  // genCutHemisphere's own base ring is an annulus (open in the middle, down
  // to the cavity) — the separate base disc below is what actually seals
  // the bottom, so it must reach at least as far down as the ball itself.
  const baseT = p.baseT ?? Math.max(0.05, ballR + bottomMargin - dropBelow);
  const baseR = p.baseR ?? outerR * 1.05;
  const shaftR = p.shaftR ?? openR * 0.6;
  const shaftTop = p.shaftTop ?? domeTopY + 0.18;
  const plateT = p.plateT ?? 0.05;
  const plateW = p.plateW ?? shaftR * 4.2, plateD = p.plateD ?? shaftR * 2.2; // asymmetric: ry reads
  const seg = p.seg ?? 24, rings = p.rings ?? 10;
  return {
    ballR, wallT, cavityR, outerR, dropBelow, openR, cutParam,
    domeTopY, baseT, baseR, shaftR, shaftTop, plateT, plateW, plateD, seg, rings,
  };
}

// rx/ry/rz: the whole male half (sphere, shaft, plate), about the ball center.
export function ball1(params = {}, pose = {}) {
  const d = ball1Dims(params);
  const rx = pose.rx ?? 0, ry = pose.ry ?? 0, rz = pose.rz ?? 0;

  const socket = { ...cutHemisphere(d.outerR, d.wallT, d.cutParam, d.seg, d.rings), t: [0, -d.dropBelow, 0] };
  const base = discAt(d.baseR, d.baseT, [0, -d.dropBelow - d.baseT / 2, 0]);

  let ball = sphere(d.ballR);
  let shaft = cylinder(d.shaftR, d.shaftTop); // native axis +Y already: base at center, up through the opening
  let plate = boxAt(d.plateW, d.plateT, d.plateD, [0, d.shaftTop + d.plateT / 2, 0]);
  for (const axis of ["x", "y", "z"]) {
    const a = { x: rx, y: ry, z: rz }[axis];
    ball = rotPiece(ball, axis, a);
    shaft = rotPiece(shaft, axis, a);
    plate = rotPiece(plate, axis, a);
  }

  return [
    tag(socket, "fixed"), tag(base, "fixed"),
    tag(ball, "ball"), tag(shaft, "ball"), tag(plate, "ball"),
  ];
}

// ==========================================================================
// mount-to-mount hinge — the hinge a limb chains through. Not a catalog
// entry, not in the gallery: exported so consumers can build with it. Reuses
// hinge1's tongue + disc-base options, then rest-swings the male 90° so its
// mount and the female's mount face different ways (an L). mount-1 spin
// carries the whole joint (the female is the parent side); mount-2 spin
// turns only a small turntable stacked on the male's outward disc face.
// ==========================================================================

export const MOUNT_REST_SWING = Math.PI / 2;

export function mountHingeDims(params = {}) {
  const d = hinge1Dims({ ...params, tongue: true, femaleBase: "disc", maleBase: "disc" });
  const turntableT = params.turntableT ?? 0.03;
  const turntableR = params.turntableR ?? (d.baseWmale / 2) * 0.75;
  const mount2FaceY = d.maleBaseY - d.baseT / 2; // male base's outward face
  const mount2Y = mount2FaceY - turntableT; // turntable's own outward face — mount-2's origin
  return { ...d, turntableT, turntableR, mount2FaceY, mount2Y };
}

// turntable: a thin disc plus an off-center tab (so a spin is visible) sat
// flush against the male base's outward face, in the tongue's own unswung
// local frame (the rest-swing is applied afterward, same as the tongue).
function buildMount2Turntable(d) {
  const cy = d.mount2FaceY - d.turntableT / 2;
  const r = d.turntableR;
  return [discAt(r, d.turntableT, [0, cy, 0]), boxAt(r * 0.4, d.turntableT, r * 0.4, [r * 0.55, cy, 0])];
}

export function mountHinge(params = {}, pose = {}) {
  const d = mountHingeDims(params);
  const { fixed, male } = buildHinge1Raw(d);
  const swing = pose.swing ?? 0;
  const m1 = pose.mount1Spin ?? 0, m2 = pose.mount2Spin ?? 0;
  const out = [];
  for (const h of fixed) out.push(tag(rotPiece(h, "y", m1), "mount1"));
  for (const h of male) {
    const swung = rotPiece(rotPiece(h, "x", MOUNT_REST_SWING + swing), "y", m1);
    out.push(tag(swung, "swing"));
  }
  for (let h of buildMount2Turntable(d)) {
    h = rotPiece(h, "y", m2); // spin about mount-2's own (unswung) normal first
    h = rotPiece(h, "x", MOUNT_REST_SWING + swing);
    h = rotPiece(h, "y", m1); // then carried by the whole joint like the rest of the male
    out.push(tag(h, "mount2"));
  }
  return out;
}

// ---- catalog previews: { items, meshes } — baked handles plus color -------

export const catalogHinge1 = (seed, params, pose) => collect((p) => hinge1(p, pose), seed, params);
export const catalogHinge2 = (seed, params, pose) => collect((p) => hinge2(p, pose), seed, params);
export const catalogBall1 = (seed, params, pose) => collect((p) => ball1(p, pose), seed, params);
