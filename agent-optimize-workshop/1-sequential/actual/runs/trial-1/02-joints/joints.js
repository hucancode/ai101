// Joint catalog: hinge1 (1DOF), hinge2 (2DOF), ball1 (3DOF), plus the
// mount-to-mount hinge (exported for consumers, not a catalog/gallery entry).
//
// A joint is a builder function (add, params, pose) -> void, matching
// primitives.collect()'s contract exactly: it calls add(handle) for every
// piece of BOTH halves. Every piece is authored around the joint's local
// origin (the pin axis, or the ball center) so posing is just a further
// rotX/rotY/rotZ pivoting at (0,0,0), applied after a piece's own local
// placement and before any outer placement the caller does.
//
// All derived measurements for the hinge family (knuckle radii, gap widths
// with clearance, bridge/base widths, pin half-length) live in hingeDims()
// — the ONE place both the geometry (below) and the slots (slots.js) read,
// so a slot can never drift from what it seats on.
import * as P from "./primitives.js";

const { box, cylinder, sphere, cutHemisphere, rotX, rotY, rotZ, translate } = P;

// ---------------------------------------------------------------------------
// hinge family — shared derived dimensions
// ---------------------------------------------------------------------------
export function hingeDims(p = {}) {
  const armR = p.armR ?? 0.14;          // knuckle sleeve radius
  const pinR = p.pinR ?? 0.045;         // pin shaft radius
  const kLen = p.kLen ?? 0.2;           // one knuckle's length along the pin
  const clearance = p.clearance ?? 0.03; // axial gap between neighbour knuckles
  const reach = p.reach ?? 0.4;         // pin -> base plate distance
  const armW = p.armW ?? kLen * 0.82;   // arm shaft width (along pin axis)
  const armD = p.armD ?? armR * 1.7;    // arm shaft depth
  const baseT = p.baseT ?? 0.09;        // base plate / disc thickness
  const pinMargin = p.pinMargin ?? 0.035; // pin overhang past the outer knuckle face
  const discR = p.discR ?? armR * 2.2;  // disc-style base radius

  // four knuckles, interleaved F,M,M,F, centered on the pin axis (x=0)
  const totalSpan = 4 * kLen + 3 * clearance;
  const step = kLen + clearance;
  const xF1 = -totalSpan / 2 + kLen / 2;
  const xM1 = xF1 + step;
  const xM2 = xM1 + step;
  const xF2 = xM2 + step;
  const pinHalfLen = totalSpan / 2 + pinMargin;

  const femaleBaseW = totalSpan + armR;      // spans both outer (female) knuckles
  const maleSpan = xM2 - xM1 + kLen;         // spans both inner (male) knuckles
  const maleBaseW = maleSpan + armR;
  const baseD = armD * 1.5;

  return {
    armR, pinR, kLen, clearance, reach, armW, armD, baseT, pinMargin, discR,
    totalSpan, xF1, xM1, xM2, xF2, pinHalfLen, femaleBaseW, maleBaseW, maleSpan, baseD,
  };
}

// ---- hinge-stage pieces, all built in an X-pin local layout -------------
// (pin along X, spread along X, reach along Y, depth along Z). buildStage()
// reorients the whole batch to a Z-pin layout when asked, via one rotY.

function knuckle(d, x) {                     // sleeve at knuckle-center x
  const h = cylinder(d.armR, d.kLen, 16);
  rotZ(h, -Math.PI / 2);                      // cylinder's Y axis -> X axis
  translate(h, x - d.kLen / 2, 0, 0);
  return h;
}

function armShaft(d, x, up) {                 // up: female (extends +Y); else male (-Y)
  const h = box(d.armW, d.reach, d.armD);
  translate(h, x, up ? d.reach / 2 : -d.reach / 2, 0);
  return h;
}

function baseBox(width, d, up) {
  const h = box(width, d.baseT, d.baseD);
  translate(h, 0, up ? d.reach + d.baseT / 2 : -(d.reach + d.baseT / 2), 0);
  return h;
}

function baseDisc(d, up) {
  const h = cylinder(d.discR, d.baseT, 20);    // origin = base-circle center, body 0..baseT
  translate(h, 0, up ? d.reach : -(d.reach + d.baseT), 0);
  return h;
}

function pinShaft(d) {                        // bare shaft, overhangs both outer knuckle faces
  const h = cylinder(d.pinR, d.pinHalfLen * 2, 12);
  rotZ(h, -Math.PI / 2);
  translate(h, -d.pinHalfLen, 0, 0);
  return h;
}

function tongueKnuckle(d) {                   // solid tongue instead of the 2 male knuckles
  const h = cylinder(d.armR, d.maleSpan, 16);
  rotZ(h, -Math.PI / 2);
  translate(h, -d.maleSpan / 2, 0, 0);
  return h;
}

function tongueArm(d) {
  const h = box(d.maleSpan * 0.85, d.reach, d.armD);
  translate(h, 0, -d.reach / 2, 0);
  return h;
}

// Build one hinge stage around local origin (0,0,0) = the pin. Returns
// { female:[handles], male:[handles] } — NOT added yet, so a caller (hinge2,
// mountHinge) can compose further outer transforms before add()-ing.
//   axis        'x' (default) or 'z' — the pin's final direction
//   maleAngle   the stage's own pose rotation for the male half (swing / rz),
//               pivoting at (0,0,0) — applied before any outer transform
//   tongue      solid tongue instead of the male U
//   femaleBase / maleBase   'u' | 'disc' | 'none' (none = shares a neighbour's)
export function buildStage(d, o = {}) {
  const axis = o.axis || "x";
  const maleAngle = o.maleAngle || 0;
  const femaleBase = o.femaleBase ?? "u";
  const maleBase = o.maleBase ?? "u";

  const finish = (h, isMale) => {
    if (axis === "z") rotY(h, Math.PI / 2);          // local design -> Z-pin layout
    if (isMale && maleAngle) {
      axis === "z" ? rotZ(h, maleAngle) : rotX(h, maleAngle);
    }
    return h;
  };

  const female = [
    finish(knuckle(d, d.xF1), false),
    finish(knuckle(d, d.xF2), false),
    finish(armShaft(d, d.xF1, true), false),
    finish(armShaft(d, d.xF2, true), false),
    finish(pinShaft(d), false),
  ];
  if (femaleBase === "u") female.push(finish(baseBox(d.femaleBaseW, d, true), false));
  else if (femaleBase === "disc") female.push(finish(baseDisc(d, true), false));

  const male = o.tongue
    ? [finish(tongueKnuckle(d), true), finish(tongueArm(d), true)]
    : [
        finish(knuckle(d, d.xM1), true),
        finish(knuckle(d, d.xM2), true),
        finish(armShaft(d, d.xM1, false), true),
        finish(armShaft(d, d.xM2, false), true),
      ];
  if (maleBase === "u") male.push(finish(baseBox(d.maleBaseW, d, false), true));
  else if (maleBase === "disc") male.push(finish(baseDisc(d, false), true));

  return { female, male };
}

// ---------------------------------------------------------------------------
// hinge1 — pin along X, one stage. Pose: swing.
// ---------------------------------------------------------------------------
export function hinge1(add, params = {}, pose = {}) {
  const d = hingeDims(params);
  const disc = !!params.discBases;
  const { female, male } = buildStage(d, {
    axis: "x",
    maleAngle: pose.swing || 0,
    tongue: !!params.tongue,
    femaleBase: params.femaleBase ?? (disc ? "disc" : "u"),
    maleBase: params.maleBase ?? (disc ? "disc" : "u"),
  });
  for (const h of female) add(h);
  for (const h of male) add(h);
}

// ---------------------------------------------------------------------------
// hinge2 — upper stage (pin X) then a second stage directly below (pin Z),
// pins offset along Y so they never meet (not a Cardan cross, not one hub).
// The upper male carries no base; the lower female's base is the single
// plate between the two stages. Pose: rx (upper male + all of lower stage),
// rz (lower male only).
// ---------------------------------------------------------------------------
export function hinge2(add, params = {}, pose = {}) {
  const d = hingeDims(params);
  const disc = !!params.discBases;
  const rx = pose.rx || 0, rz = pose.rz || 0;
  const baseStyle = disc ? "disc" : "u";

  const upper = buildStage(d, { axis: "x", femaleBase: baseStyle, maleBase: "none" });
  for (const h of upper.female) add(h);
  for (const h of upper.male) { rotX(h, rx); add(h); }

  // pin-to-pin offset: upper reach + plate thickness + lower reach, so the
  // plate's near face lands flush on the upper male's arm tip with no overlap
  const D = 2 * d.reach + d.baseT;
  const lower = buildStage(d, {
    axis: "z", maleAngle: rz,
    tongue: !!params.tongue, femaleBase: baseStyle, maleBase: baseStyle,
  });
  for (const h of [...lower.female, ...lower.male]) {
    translate(h, 0, -D, 0);
    rotX(h, rx);
    add(h);
  }
}

// ---------------------------------------------------------------------------
// ball1 — ball center = origin. cutHemisphere is at most a hemisphere in its
// OWN frame (y in [0, cut*r]), so to reach past the BALL's equator (y=0) the
// socket piece is dropped below the ball center by `socketDrop`: its local
// span [0,cut*socketR] maps to ball-frame [-socketDrop, cut*socketR-socketDrop],
// a range whose low end is negative — past the equator — while the high end
// stays under ballR, so only a top cap shows through the opening.
// ---------------------------------------------------------------------------
export function ball1Dims(p = {}) {
  const ballR = p.ballR ?? 0.32;
  const socketClear = p.socketClear ?? 0.05;    // radial clearance, ball -> socket cavity
  const socketR = ballR + socketClear;
  const wall = p.wall ?? 0.07;                  // socket wall thickness (absolute)
  const wallFrac = wall / socketR;
  const cut = p.cut ?? 0.86;                    // opening height, fraction of socketR
  const socketDrop = p.socketDrop ?? ballR * 0.22; // how far past the equator the cup reaches
  const baseR = socketR * 0.92;                 // thin base below; never exceeds socket radius
  const baseT = p.baseT ?? 0.05;
  const shaftR = p.shaftR ?? ballR * 0.34;
  const shaftLen = p.shaftLen ?? ballR * 0.9;
  const plateR = p.plateR ?? shaftR * 1.8;
  const plateT = p.plateT ?? 0.06;
  return { ballR, socketClear, socketR, wall, wallFrac, cut, socketDrop, baseR, baseT, shaftR, shaftLen, plateR, plateT };
}

export function ball1(add, params = {}, pose = {}) {
  const d = ball1Dims(params);

  const socket = cutHemisphere(d.socketR, d.wallFrac, d.cut, 24, 8);
  translate(socket, 0, -d.socketDrop, 0);
  add(socket);
  const base = cylinder(d.baseR, d.baseT, 20);
  translate(base, 0, -d.socketDrop - d.baseT, 0);
  add(base);

  const rx = pose.rx || 0, ry = pose.ry || 0, rz = pose.rz || 0;
  const poseMale = (h) => {
    if (rx) rotX(h, rx);
    if (ry) rotY(h, ry);
    if (rz) rotZ(h, rz);
    add(h);
  };
  poseMale(sphere(d.ballR, 24, 16));
  poseMale(cylinder(d.shaftR, d.shaftLen, 16));           // shaft: ball center up through opening
  const plate = cylinder(d.plateR, d.plateT, 16);
  translate(plate, 0, d.shaftLen, 0);
  poseMale(plate);
}

// ---------------------------------------------------------------------------
// mount-to-mount hinge — the hinge a limb chains through. Solid male, disc
// bases (the two mounts), rest-swung 90 degrees into an L: mount-1 (female
// disc) keeps its natural +Y outward normal; mount-2 (male disc) is carried
// by that same 90-degree rest rotation, so its outward normal ends up
// perpendicular to mount-1's (a right angle, not a straight I-beam) — the
// two mounts face different ways and a hung limb clears the parent body.
// Pose: swing (added on top of the rest bend), mount1Spin (the whole joint,
// pivoting on mount-1's own axis since the female is the parent), mount2Spin
// (the mount-2 turntable only, pivoting on its own axis before it's carried).
// ---------------------------------------------------------------------------
export const MOUNT_REST_SWING = Math.PI / 2;

export function mountHinge(add, params = {}, pose = {}) {
  const d = hingeDims(params);
  const swing = MOUNT_REST_SWING + (pose.swing || 0);
  const mount1 = pose.mount1Spin || 0;
  const mount2 = pose.mount2Spin || 0;

  const st = buildStage(d, {
    axis: "x", maleAngle: swing, tongue: true,
    femaleBase: "disc", maleBase: "none",
  });

  const disc = cylinder(d.discR, d.baseT, 20);       // mount-2 turntable, spins independently
  rotY(disc, mount2);                                // pivot at its own center (axis-aligned)
  translate(disc, 0, -(d.reach + d.baseT), 0);        // place at the tip
  rotX(disc, swing);                                 // then carried by the shared bend

  for (const h of [...st.female, ...st.male, disc]) {
    if (mount1) rotY(h, mount1);                     // outermost: the whole joint spins
    add(h);
  }
}
