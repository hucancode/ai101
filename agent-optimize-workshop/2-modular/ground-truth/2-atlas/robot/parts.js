// ATLAS PART KIT — pure content. Every part is ONE core solid (plus trim), a set of
// named ANCHORS (faces it offers a child) and one MOUNT (the face it plugs into its
// parent by). That is the whole vocabulary: no part writes a coordinate, a normal,
// an offset or a joint dimension. A piece is placed against a FACE; an anchor IS a
// face; the joint sizes itself from the child's plug.
//
//   head      cylinder drum, face forward       torso   box + rounded flanks
//   pelvis    disc + a half-cylinder crotch     upperArm / shin   cylinder
//   forearm / palm / digit / thigh   box        foot    box, with toe + heel boxes
//
// Nothing here mentions the shoulder's disc, the elbow's tongue or the waist's ball:
// the joint engine grows those out of the faces below, at the size of the limb that
// lands on them.
import { createPart, box, cylinder, halfCylinder } from "../engines/modeling.js";

// The figure these numbers cut is the same one the sequential workshop builds: 5.26
// tall, soles on the grid, with the knee, hip, waist, shoulder, elbow, palm and head
// landing at the same heights. Only the sizes live here — the joints between them are
// still the engine's, grown from each child's plug, so the hardware is a little
// trimmer than the hand-authored clevises there.
export const ATLAS_PARAMS = {
  head: { r: 0.28, depth: 0.56, ring: 0.06, innerR: 0.22, ear: 0.09, neckR: 0.14, neckT: 0.059 },
  torso: { chestW: 1.15, chestH: 1.012, chestD: 0.68, panel: 0.06, shoulderV: 0.458 },
  pelvis: { hipW: 0.86, discT: 0.2, crotchR: 0.4, crotchT: 0.35, hubR: 0.18, hubT: 0.07 },
  upperArm: { r: 0.15, len: 0.513 },
  forearm: { w: 0.26, len: 0.802, d: 0.234 },
  palm: { w: 0.26, h: 0.26, d: 0.24 },
  digit: { w: 0.1, len: 0.085 },
  thigh: { w: 0.38, len: 0.657, d: 0.42, plug: 0.95 },
  shin: { r: 0.16, len: 0.819, kneeR: 0.19, ankleR: 0.14, plate: 0.06 },
  foot: { w: 0.32, h: 0.2, ankleD: 0.24, toeD: 0.5, heelD: 0.28, plug: 1 },
};

// HEAD — a drum lying on its side (face = the flat disc), rings proud of the face,
// ear pods on the barrel. A short NECK BOSS hangs under the drum, and the head plugs
// into the torso by the boss's underside — so the neck ball is sized by the boss, not
// by the drum, and the drum rides clear of the chest instead of sitting on it.
function head(P, p) {
  const drum = P.piece(cylinder(p.r, p.depth, { axis: "z" }));
  const ring = P.join(drum, "front", cylinder(p.r + 0.03, p.ring, { axis: "z" }), "back");
  P.join(ring, "front", cylinder(p.innerR, 0.05, { axis: "z" }), "back");
  P.join(drum, "side", cylinder(p.ear, 0.06, { axis: "x" }), "left", { a: 90 });
  P.join(drum, "side", cylinder(p.ear, 0.06, { axis: "x" }), "right", { a: 270 });
  const neck = P.join(drum, "side", cylinder(p.neckR, p.neckT, { axis: "y" }), "top", { a: 180 });
  P.mount(neck, "bottom");                            // the neck boss, under the drum
}

// TORSO — a slab chest: a core box with a rounded half-cylinder flank on each side
// and a thin front panel. The arms hang off the FLANKS, the head off the top, and
// the whole torso plugs into the pelvis by a shrunken waist face.
function torso(P, p) {
  const chest = P.piece(box(p.chestW - p.chestD, p.chestH, p.chestD));
  const r = p.chestD / 2;
  const fl = P.join(chest, "left", halfCylinder(r, p.chestH, { axis: "y", round: "-x" }), "flat");
  const fr = P.join(chest, "right", halfCylinder(r, p.chestH, { axis: "y", round: "+x" }), "flat");
  P.join(chest, "front", box((p.chestW - p.chestD) * 0.85, p.chestH * 0.72, p.panel), "back", { v: 0.1 });
  P.anchor("neck", chest, "top");
  P.anchor("shoulderL", fl, "round", { v: p.shoulderV });
  P.anchor("shoulderR", fr, "round", { v: p.shoulderV });
  P.mount(chest, "bottom", { scale: 0.85 });          // the waist plug — a broad shaft
}

// PELVIS — the rig's root: a disc with a SLIM half-cylinder crotch slung under it,
// capped at each end by a HUB disc. The waist socket sits on the top disc; the legs
// hang off the hubs, not off the crotch itself — a hub is a round seat the size of
// the thigh's plug, so the hip's own base plate lands on a face that already matches
// it. The crotch only has to bridge the two hubs, so it can be thin.
function pelvis(P, p) {
  const disc = P.piece(cylinder(p.hipW / 2, p.discT, { axis: "y" }));
  const crotch = P.join(disc, "bottom",
    halfCylinder(p.crotchR, p.crotchT, { axis: "x", round: "-y" }), "flat");
  const hl = P.join(crotch, "left", cylinder(p.hubR, p.hubT, { axis: "x" }), "right");
  const hr = P.join(crotch, "right", cylinder(p.hubR, p.hubT, { axis: "x" }), "left");
  P.anchor("waist", disc, "top");
  P.anchor("hipL", hl, "left");
  P.anchor("hipR", hr, "right");
}

// UPPER ARM — a biceps cylinder. It carries the shoulder's moving half (the engine
// grows it out of the mount face) and offers the elbow below.
function upperArm(P, p) {
  const arm = P.piece(cylinder(p.r, p.len, { axis: "y" }));
  P.anchor("elbow", arm, "bottom");
  P.mount(arm, "top");
}

function forearm(P, p) {
  const b = P.piece(box(p.w, p.len, p.d));
  P.anchor("wrist", b, "bottom");
  P.mount(b, "top");
}

// PALM — a gripper block. All three knuckles hang off the UNDERSIDE: the thumb behind,
// two fingers in front. They must be UNDER the block, not on its side faces — a
// knuckle level with the palm swings its digit straight through it as the finger
// closes, which is a fold no clearance can save.
function palm(P, p) {
  const b = P.piece(box(p.w, p.h, p.d));
  P.anchor("f0", b, "bottom", { v: -0.55 });            // the thumb, at the back
  P.anchor("f1", b, "bottom", { u: -0.5, v: 0.55 });
  P.anchor("f2", b, "bottom", { u: 0.5, v: 0.55 });
  P.mount(b, "top");
}

// DIGIT — one box knuckle-to-knuckle. Three of them chained make a finger; the
// chain's first link hangs off a palm face, so the fingers oppose each other with
// no mirrored geometry at all.
function digit(P, p) {
  const b = P.piece(box(p.w, p.len, p.w));
  P.anchor("tip", b, "bottom");
  P.mount(b, "top");
}

function thigh(P, p) {
  const b = P.piece(box(p.w, p.len, p.d));
  P.anchor("knee", b, "bottom");
  P.mount(b, "top", { scale: p.plug, round: true });   // a round plug: the hip spins in it
}

// SHIN — a calf cylinder between two END PLATES: a wide disc at the knee, a narrow
// one at the ankle. The plates ARE the joint faces — each is cut to the size of the
// part on the far side of the joint (the knee plate matches the thigh's foot, the
// ankle plate matches the foot's plug), so the calf's own diameter is free to be
// whatever looks right without dragging the two joints along with it.
function shin(P, p) {
  const b = P.piece(cylinder(p.r, p.len, { axis: "y" }));
  const knee = P.join(b, "top", cylinder(p.kneeR, p.plate, { axis: "y" }), "bottom");
  const ankle = P.join(b, "bottom", cylinder(p.ankleR, p.plate, { axis: "y" }), "top");
  P.anchor("ankle", ankle, "bottom");
  P.mount(knee, "top");
}

// FOOT — an ankle box with a sloped toe forward and a heel back, all sharing one
// height, so the sole is one plane by construction (`flush: "bottom"`).
function foot(P, p) {
  const ankle = P.piece(box(p.w, p.h, p.ankleD));
  P.join(ankle, "front", box(p.w * 0.94, p.h, p.toeD, { slope: 0.45 }), "back", { flush: "bottom" });
  P.join(ankle, "back", box(p.w, p.h, p.heelD, { slope: -0.35 }), "front", { flush: "bottom" });
  P.mount(ankle, "top", { scale: p.plug });
}

const BUILDERS = { head, torso, pelvis, upperArm, forearm, palm, digit, thigh, shin, foot };

// build a part: its meshes (in part space), the faces it offers, and its plug section
export function buildPart(name, params = null) {
  const P = createPart();
  BUILDERS[name](P, { ...ATLAS_PARAMS[name], ...(params || {}) });
  return P.finish();
}

export const ATLAS_KIT = { build: buildPart, params: ATLAS_PARAMS };
