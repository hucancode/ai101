// ATLAS — THE PARTS. Pure content.
//
// Each part is ONE core solid, some trim JOINED to a face of it, a few named ANCHORS
// (faces it offers a child) and one MOUNT (the face it plugs into its parent by).
// Nothing here writes a coordinate, an offset, a rest rotation or a joint dimension:
// a piece is placed against a FACE, an anchor IS a face, and the mount's section is
// the only size any joint is ever handed.
//
// The modeling engine re-bases every part on its mount, so inside a part "+Y is the
// way I plug in" and "-Y is where my body goes" — which is why a rig can say `along`
// / `against` and never a vector.
import { createPart, box, cylinder, halfCylinder } from "./engines/modeling.js";

// ---- head — a drum whose FACE is its flat disc, so the barrel axis is forward ----
export function head() {
  const p = createPart();
  const drum = p.piece(cylinder(0.14, 0.2, { axis: "z" }));      // face = +Z
  const ring = p.join(drum, "front", cylinder(0.1, 0.03, { axis: "z" }), "back");
  p.join(ring, "front", cylinder(0.06, 0.03, { axis: "z" }), "back");
  for (const a of [90, 270])                                     // ear pods, on the barrel
    p.join(drum, "side", cylinder(0.05, 0.05, { axis: "x" }), "left", { a });
  p.mount(drum, "side", { a: 180, scale: 0.9 });                 // the neck plugs underneath
  return p.finish();
}

// ---- torso — a box, a rounded flank each side, a front panel --------------------
export function torso() {
  const p = createPart();
  const core = p.piece(box(0.42, 0.52, 0.26));
  const flankR = p.join(core, "right", halfCylinder(0.1, 0.44, { axis: "y", round: "+x" }), "flat");
  const flankL = p.join(core, "left", halfCylinder(0.1, 0.44, { axis: "y", round: "-x" }), "flat");
  p.join(core, "front", box(0.3, 0.34, 0.05), "back");

  p.anchor("neck", core, "top");
  p.anchor("shoulder.R", flankR, "round", { v: 0.6 });           // high on the flank
  p.anchor("shoulder.L", flankL, "round", { v: 0.6 });
  p.mount(core, "bottom", { scale: 0.85, round: true });
  return p.finish();
}

// ---- pelvis — a disc, the rig's root, a half-cylinder crotch slung under it ------
export function pelvis() {
  const p = createPart();
  const core = p.piece(cylinder(0.2, 0.26, { axis: "y" }));
  p.join(core, "bottom", halfCylinder(0.16, 0.3, { axis: "x", round: "-y" }), "flat");

  p.anchor("waist", core, "top");
  p.anchor("hip.R", core, "side", { a: 0, v: -0.3 });
  p.anchor("hip.L", core, "side", { a: 180, v: -0.3 });
  return p.finish();                                             // no mount: it is the root
}

// ---- arm ------------------------------------------------------------------------
export function upperArm() {
  const p = createPart();
  const core = p.piece(cylinder(0.05, 0.3, { axis: "y" }));
  p.anchor("elbow", core, "bottom");
  p.mount(core, "top", { scale: 0.85 });
  return p.finish();
}

export function forearm() {
  const p = createPart();
  const core = p.piece(box(0.09, 0.26, 0.09));
  p.anchor("wrist", core, "bottom");
  p.mount(core, "top", { scale: 0.9 });
  return p.finish();
}

export function palm() {
  const p = createPart();
  const core = p.piece(box(0.1, 0.1, 0.05));
  p.anchor("finger.a", core, "front", { u: -0.45 });
  p.anchor("finger.b", core, "front", { u: 0.45 });
  p.anchor("thumb", core, "back");                               // the face that points the other way
  p.mount(core, "top", { scale: 0.9 });
  return p.finish();
}

export function digit() {
  const p = createPart();
  const core = p.piece(box(0.03, 0.05, 0.028));
  p.anchor("tip", core, "bottom");
  p.mount(core, "top", { scale: 0.9 });
  return p.finish();
}

// ---- leg -------------------------------------------------------------------------
export function thigh() {
  const p = createPart();
  const core = p.piece(box(0.13, 0.42, 0.15));
  p.anchor("knee", core, "bottom");
  p.mount(core, "top", { scale: 0.85, round: true });
  return p.finish();
}

export function shin() {
  const p = createPart();
  const core = p.piece(cylinder(0.06, 0.4, { axis: "y" }));
  p.anchor("ankle", core, "bottom");
  p.mount(core, "top", { scale: 0.9 });
  return p.finish();
}

// the ankle box is the core; toe and heel are trim, flushed to ONE sole plane
export function foot() {
  const p = createPart();
  const core = p.piece(box(0.13, 0.1, 0.14));
  p.join(core, "front", box(0.13, 0.08, 0.16, { slope: 0.45 }), "back", { flush: "bottom" });
  p.join(core, "back", box(0.13, 0.07, 0.08), "front", { flush: "bottom" });
  p.mount(core, "top", { scale: 0.8 });
  return p.finish();
}

export const PARTS = {
  head, torso, pelvis, upperArm, forearm, palm, digit, thigh, shin, foot,
};
