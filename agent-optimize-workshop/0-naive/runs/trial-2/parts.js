// parts.js — the pieces that hang between the mechanisms.
//
// Every part is sized FROM a joint's published geometry (gapInner / webSpan / r),
// never by eye:
//   * a part that turns inside a hinge is at most `gapInner` wide ACROSS the pin,
//     so it swings between the cheeks instead of through them;
//   * a part that carries the next hinge stops exactly at that hinge's clevis back
//     (webSpan[0] short of the pivot), so the two weld into one solid limb.

import { HPI } from "./gfx.js";
import { box, cylinder, sphere, hemisphere, halfCylinder, cone, piece } from "./primitives.js";
import { hinge } from "./joints.js";

/**
 * A limb bone: a bar running from this node's pivot (y=0) to the next pivot at
 * `len` along `dir` (-1 = down, +1 = up). It stops short by the next clevis's back
 * so the fork continues the bar with no gap and no overlap.
 */
export function bone(node, col, { len, w, d, dir = -1, nextWeb = 0 }) {
  const shaft = len - nextWeb;
  if (shaft <= 0) throw new Error(`bone: len ${len} too short for the next clevis (${nextWeb})`);
  piece(node, box(w, shaft, d), col, { at: [0, (dir * shaft) / 2, 0] });
  return shaft;
}

/**
 * A gripper: palm + two opposed fingers + one thumb, all on real little hinges.
 * The palm is far wider than the wrist's cheek gap, so it may not start AT the pin —
 * a stem of exactly `gapInner` carries it clear of the cheeks (radius `wristR`)
 * before it widens out. `stem` therefore has to exceed wristR.
 */
export function gripper(node, col, { wristR, gapInner, len = 0.05 }) {
  const stem = wristR * 1.15;
  piece(node, box(gapInner, stem, gapInner), col, { at: [0, -stem / 2, 0] });

  const palmW = wristR * 2.6, palmH = len * 1.2, palmD = wristR * 2.0;
  piece(node, box(palmW, palmH, palmD), col, { at: [0, -stem - palmH / 2, 0] });

  const fr = wristR * 0.42;                    // finger hinge radius
  const baseY = -stem - palmH;
  const specs = [
    { x: -palmW * 0.28, z: palmD * 0.28, dir: 1 },  // front pair close toward -Z ...
    { x: palmW * 0.28, z: palmD * 0.28, dir: 1 },
    { x: 0, z: -palmD * 0.30, dir: -1 },            // ... the thumb closes toward +Z
  ];
  const fingers = [];
  for (const s of specs) {
    const knuckle = hinge(node, col, { origin: [s.x, baseY, s.z], axis: "x", r: fr, web: "y+" });
    const seg = len * 0.9;
    bone(knuckle.node, col, { len: seg, w: knuckle.gapInner, d: fr * 1.1, nextWeb: fr * 0.8 });
    const mid = hinge(knuckle.node, col, {
      origin: [0, -seg, 0], axis: "x", r: fr * 0.9, web: "y+",
    });
    bone(mid.node, col, { len: seg * 0.85, w: mid.gapInner, d: fr * 1.0 });
    piece(mid.node, sphere(fr * 0.6, 10, 6), col, { at: [0, -seg * 0.85, 0] }); // pad
    fingers.push({ base: knuckle.node, mid: mid.node, dir: s.dir });
  }
  return fingers;
}

/** A foot: ankle block, sole plate, rounded toe. Rigid — the ankle is not a channel. */
export function foot(node, col, { shinW, len = 0.26 }) {
  const soleH = 0.04, w = shinW * 1.35;
  piece(node, box(shinW * 0.9, 0.05, shinW * 0.9), col, { at: [0, -0.025, 0] });     // ankle block
  piece(node, box(w, soleH, len * 0.75), col, { at: [0, -0.05 - soleH / 2, len * 0.14] });
  piece(node, halfCylinder(soleH / 2 + 0.005, w), col, {
    rz: HPI, at: [0, -0.05 - soleH / 2, len * 0.14 + (len * 0.75) / 2],
  });                                                                                 // toe cap
  piece(node, box(w * 0.7, 0.03, 0.05), col, { at: [0, -0.05 - soleH / 2, -len * 0.24] }); // heel
}

/**
 * The head shell: cranium, visor, two lens eyes, an antenna.
 * Same rule as the gripper: the cranium is wider than the neck hinge's gap, so a
 * stem of `gapInner` lifts it clear of the pitch cheeks (radius `pinR`) first.
 */
export function headShell(node, col, { r = 0.1, pinR, gapInner }) {
  const stem = pinR * 1.15;
  piece(node, box(gapInner, stem, gapInner), col, { at: [0, stem / 2, 0] });
  const c = stem + r * 0.95;                // centre of the cranium above the pitch pin
  piece(node, box(r * 1.9, r * 1.9, r * 1.8), col, { at: [0, c, 0] });
  piece(node, hemisphere(r * 0.95, true), col, { at: [0, c + r * 0.95, 0] });         // crown
  piece(node, box(r * 1.7, r * 0.7, r * 0.15), col, { at: [0, c + r * 0.15, r * 0.92] }); // visor
  for (const s of [-1, 1])
    piece(node, cylinder(r * 0.26, r * 0.26, r * 0.12), col, {
      rx: HPI, at: [s * r * 0.55, c + r * 0.15, r * 1.0],
    });
  piece(node, cylinder(r * 0.06, r * 0.06, r * 0.7), col, { at: [0, c + r * 2.2, 0] });
  piece(node, sphere(r * 0.14, 10, 6), col, { at: [0, c + r * 2.6, 0] });
  piece(node, cone(r * 0.2, r * 0.3), col, { at: [0, c + r * 1.05, -r * 0.5], rx: -HPI });
}

/** Chest shell above the waist ball: column out of the socket, ribcage, back pack. */
export function chestShell(node, col, { neckR, colH, w, h, d, exitR }) {
  piece(node, cylinder(exitR, exitR * 1.15, colH), col, { at: [0, colH / 2, 0] });    // neck of the ball
  const cy = colH + h / 2;
  piece(node, box(w, h, d), col, { at: [0, cy, 0] });
  piece(node, halfCylinder(d * 0.45, h * 0.8), col, { at: [0, cy, d / 2] });          // breast plate
  piece(node, box(w * 0.55, h * 0.5, d * 0.35), col, { at: [0, cy + h * 0.1, -d * 0.6] }); // back pack
  piece(node, cylinder(neckR * 1.4, neckR * 1.4, 0.03), col, { at: [0, colH + h, 0] });    // collar
}

/** Pelvis shell: the block the legs hang off and the socket sits on. */
export function pelvisShell(node, col, { w, h, d, hipX, hipY }) {
  piece(node, box(w, h, d), col, { at: [0, 0, 0] });
  piece(node, box(w * 0.75, 0.03, d * 0.8), col, { at: [0, h / 2 + 0.015, 0] });      // socket plate
  // hip mounts: bridge the pelvis block down to each hip pivot, nothing further
  for (const s of [-1, 1])
    piece(node, box(0.09, Math.abs(hipY), d * 0.55), col, { at: [s * hipX, hipY / 2, 0] });
}
