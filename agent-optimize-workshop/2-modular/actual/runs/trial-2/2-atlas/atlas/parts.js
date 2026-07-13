// atlas — the parts.
//
// Pure content. Each part is ONE core solid (plus trim, which carries no anchors and no
// mount), a few named ANCHORS — the faces it offers a child — and one MOUNT: the face it
// plugs into its parent by. Nothing here writes a coordinate, an offset, a joint
// dimension or a rest rotation: `join` seats trim on a named face, `anchor` names a face,
// `mount` names a face and shrinks the plug, and `finish` re-bases the part on it.
//
// Sizes ARE content — a part's own w/h/d is what makes it that part — but every
// PLACEMENT is a face name.

import {
  piece, join, anchor, mount, finish,
  box, cylinder, halfCylinder,
} from "../engines/modeling.js";
import { HPI } from "../gfx.js";

// The mount is what sizes every joint the part plugs into: `scale` shrinks the plug (a
// torso does not hang off the full width of its chest), `round` makes it a disc.

// pelvis — a disc, the rig's ROOT: it has no mount. A half-cylinder crotch slung under.
export function pelvis() {
  const core = piece(cylinder(0.17, 0.16, "y"));
  join(core, "bottom", halfCylinder(0.15, 0.22, "x", "-y"), "flat");
  anchor("waist", core, "top");
  anchor("hip.R", core, "side", { angle: 0 });
  anchor("hip.L", core, "side", { angle: Math.PI });
  return finish();
}

// torso — a box, with a rounded half-cylinder flank each side and a front panel. The arm
// hangs off a flank, so a flank is the face the shoulder is offered on.
export function torso() {
  const core = piece(box(0.44, 0.62, 0.30));
  const flankR = join(core, "right", halfCylinder(0.09, 0.34, "y", "+x"), "flat", { u: 0.45 });
  const flankL = join(core, "left", halfCylinder(0.09, 0.34, "y", "-x"), "flat", { u: 0.45 });
  join(core, "front", box(0.30, 0.40, 0.03), "back");
  anchor("neck", core, "top");
  anchor("shoulder.R", flankR, "side", { angle: 0 });
  anchor("shoulder.L", flankL, "side", { angle: 0 });
  mount(core, "bottom", { scale: 0.7, round: true });
  return finish();
}

// head — a cylinder drum, axis forward, so the face is its flat disc: rings on the face,
// ear pods on the barrel. It plugs in by the top of the barrel.
export function head() {
  const drum = piece(cylinder(0.16, 0.22, "z"));
  join(drum, "front", cylinder(0.115, 0.02, "z"), "back");
  join(drum, "front", cylinder(0.055, 0.05, "z"), "back");
  join(drum, "side", cylinder(0.045, 0.05, "x"), "left", { hostAngle: 0 });
  join(drum, "side", cylinder(0.045, 0.05, "x"), "right", { hostAngle: Math.PI });
  mount(drum, "side", { angle: -HPI, scale: 0.75, round: true });
  return finish();
}

// upperArm, shin — a cylinder. forearm, thigh, palm, digit — a box.

export function upperArm() {
  const core = piece(cylinder(0.075, 0.30, "y"));
  anchor("elbow", core, "bottom");
  mount(core, "top", { scale: 0.9 });
  return finish();
}

export function forearm() {
  const core = piece(box(0.12, 0.28, 0.11));
  anchor("wrist", core, "bottom");
  mount(core, "top", { scale: 0.85 });
  return finish();
}

// palm — one finger on the BACK face, two on the front. The palm is DEEP: two three-digit
// chains curling toward each other off opposite faces sweep an arc about as long as they
// are, so a shallow palm is one whose fingers close straight through each other. The
// depth is what lets the back one close ONTO the other two instead of past them.
export function palm() {
  const core = piece(box(0.13, 0.10, 0.23));
  anchor("digit.front.a", core, "front", { u: -0.55 });
  anchor("digit.front.b", core, "front", { u: +0.55 });
  anchor("digit.back", core, "back");
  mount(core, "top", { scale: 0.45 });
  return finish();
}

export function digit() {
  const core = piece(box(0.040, 0.030, 0.034));
  anchor("tip", core, "bottom");
  mount(core, "top", { scale: 0.8 });
  return finish();
}

export function thigh() {
  const core = piece(box(0.13, 0.36, 0.13));
  anchor("knee", core, "bottom");
  mount(core, "top", { scale: 0.8 });
  return finish();
}

export function shin() {
  const core = piece(cylinder(0.075, 0.34, "y"));
  anchor("ankle", core, "bottom");
  mount(core, "top", { scale: 0.8 });
  return finish();
}

// foot — the ankle box, a sloped toe box forward and a heel box back, both flushed to the
// ankle's underside so the three share ONE sole plane.
export function foot() {
  const core = piece(box(0.115, 0.08, 0.17));
  join(core, "front", box(0.115, 0.06, 0.11, { slope: 0.5 }), "back", { flush: "bottom" });
  join(core, "back", box(0.115, 0.06, 0.07), "front", { flush: "bottom" });
  mount(core, "top", { scale: 0.85, round: true });
  return finish();
}

export const PARTS = {
  pelvis, torso, head, upperArm, forearm, palm, digit, thigh, shin, foot,
};
