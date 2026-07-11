// ATLAS PART KIT — pure content: a standing humanoid (helmet, torso, pelvis,
// upper arm, forearm, wrist, palm, finger, thigh, shin, foot). Every part is
// primitives + joint halves the MODELING engine supplies; this file holds ONLY
// part definitions (geometry, layout, slots) — no reusable engine logic.
//
// A part embeds the FEMALE (fixed) half of every joint it offers to children
// (socket / clevis + pin at its distal slots) and the MALE (moving) half of the
// joint it plugs into its parent (male ball / male hinge U) at its OWN origin.
// The two halves of one joint live in two parts but share a JP constant below,
// so they align when the rig glues the slots.
//
// Local frame per part: the MALE joint (mount slot) is the local origin (ball
// center / pin axis); the body hangs along -Y, +Z forward — except head and
// torso, whose bodies grow +Y out of their mount ball.
import {
  box, cylinder, coneCut, sphere, cutHemisphere, halfCylinder, halfCylinderBox,
} from "../engines/modeling.js";
import { rad, HPI, rotX, rotY, rotZ, translate } from "../gfx.js";
import {
  createJointKit, hingeMounts, hingeReach, ballTop, ballSeat,
} from "../engines/joint.js";

// the joint piece meshes the joint engine sizes + places (it generates none itself)
const ATLAS_MK = {
  arm: (kR, bLen, th) => halfCylinderBox(kR, th, bLen, 16),  // female arm / male tongue D-plate
  pin: (r, len) => cylinder(r, len, 20),
  socket: (rOut, wall, cut) => cutHemisphere(rOut, wall, cut, 28, 8),
  ball: (r) => sphere(r, 20, 14),
  shaft: (r, len) => cylinder(r, len, 18),
  box: (w, h, d) => box(w, h, d),
  disc: (r, h) => cylinder(r, h, 24),
};
const { createHinge, buildJoint, socketAt, maleBall, hingeFixedAt, hingeMale } = createJointKit(ATLAS_MK);

export const ATLAS_PARAMS = {
  head: { headR: 0.28, headD: 0.56, innerR: 0.24 },
  torso: { chestW: 1.15, chestH: 0.95, chestD: 0.68 },
  pelvis: { hipW: 0.72, hipH: 0.25 },
  upperArm: { len: 0.3, w: 0.3 },
  forearm: { len: 0.24, w: 0.26 },
  wrist: {},
  palm: { w: 0.26, h: 0.26, d: 0.24 },
  finger: { digitLen: 0.16, w: 0.12, curl: 18 },
  thigh: { len: 0.56, w: 0.38 },
  shin: { len: 0.6, w: 0.32 },
  foot: { len: 0.62, w: 0.32, heelD: 0.14, heelCapD: 0.14 },
};

// Every joint's whole input space is { size, slim?, disc? }: `size` scales it,
// `slim` thins the arms/shaft (1 = default), `disc` picks a round base plate.
const ATLAS_JP = {
  neck: { size: 0.12, disc: true },      // short neck ball, disc bases both halves
  waist: { size: 0.17, disc: true },     // waist ball, 3 DOF, pelvis holds the socket
  shoulder: { size: 0.1, slim: 0.9 },    // L-seated limb hinge; the arm hangs off its male disc
  hip: { size: 0.09, slim: 0.9 },
  wrist: { size: 0.1 },                  // both stages of the universal size off this
  elbow: { size: 0.14 },                 // tongue width tracks the forearm box
  knee: { size: 0.15, disc: true },
  ankle: { size: 0.14, disc: true },
};

function torsoLayout(p) {
  const y0 = ballTop(ATLAS_JP.waist);                 // ball center -> male plate top face
  const taperH = 0.13;                                // waist block: short, no belly
  const chestY = y0 + taperH - 0.04;                  // chest slab base
  const top = chestY + p.chestH;
  return {
    y0, taperH, chestY, top,
    r: p.chestD / 2,                                  // flank half-cylinder radius = half the chest depth
    neckY: top + ballSeat(ATLAS_JP.neck),             // neck ball center
    sx: p.chestW / 2 + hingeReach(ATLAS_JP.shoulder),
    sy: top - 0.3,
    discR: hingeMounts(ATLAS_JP.shoulder).discR,      // hinge1 female disc base radius
    coneLen: 0.14,
  };
}

function pelvisLayout(p) {
  const discT = 0.14, domeW = p.hipW * 0.6;
  const discY = -ballSeat(ATLAS_JP.waist) - discT;    // disc bottom plane, under the socket
  return {
    discT, domeW, discY,
    discR: p.hipW / 2,
    hipX: domeW / 2 + hingeReach(ATLAS_JP.hip),
    hipY: discY - p.hipH * 0.45,                      // hip shoulder pins
  };
}

function upperArmLayout(p) {
  const y0 = -hingeReach(ATLAS_JP.shoulder);
  return { y0, elbowY: y0 - p.len - hingeReach(ATLAS_JP.elbow) };
}

function forearmLayout(p) {
  const m = hingeMounts(ATLAS_JP.elbow);
  const y0 = -m.bridgeY;                              // elbow male bridge face
  return {
    y0,
    boxTop: -m.clearY,
    boxBot: y0 - p.len - 0.02,
    wristY: y0 - p.len - hingeReach(ATLAS_JP.wrist),  // hinge2 stage-A pin
  };
}

// hinge2 wrist stacking: stage-B pin sits two arm reaches + the ONE shared
// middle base below stage A
const wristMidY = () => -hingeMounts(ATLAS_JP.wrist).stackY;

function palmLayout(p) {
  const fw = ATLAS_PARAMS.finger.w;              // fingers hang off the side faces
  const y0 = 0;                                       // origin = the stage-B male disc face
  const blockY = y0 - p.h / 2 + 0.02;
  const yb = blockY - p.h / 2;                        // block underside
  return {
    blockY, yb,
    knuckleY: yb + 0.06,                              // knuckle pins, near the lower edge
    fx: p.w * 0.27,                                   // front finger pair spread
    fz: p.d / 2 + fw / 2,                             // pins proud of the front/back faces
  };
}

function thighLayout(p) {
  const y0 = -hingeReach(ATLAS_JP.hip);
  return { y0, kneeY: y0 - p.len - hingeReach(ATLAS_JP.knee) };
}

function shinLayout(p) {
  const y0 = -hingeReach(ATLAS_JP.knee);
  return { y0, ankleY: y0 - p.len - hingeReach(ATLAS_JP.ankle) };
}

const FOOT_SLOPE = 0.55, FOOT_H = 0.2, TOE_D = 0.2, ANKLE_D = 0.24;

function footLayout(p) {
  const soleY = -hingeReach(ATLAS_JP.ankle) - 0.02;   // foot top plane, at the ankle
  const z0 = ANKLE_D / 2;                             // ankle base front face
  const footD = p.len - z0 - TOE_D;                   // slope run, ankle base -> toe
  return {
    soleY, footD,
    midY: soleY - FOOT_H / 2,                         // sole slab center height
    toeH: FOOT_H * (1 - FOOT_SLOPE),
    footZ: z0 + footD / 2,
    toeZ: z0 + footD + TOE_D / 2,
    heelZ: -z0 - p.heelD / 2,                         // heel base, off the ankle base rear face
    heelCapZ: -z0 - p.heelD - p.heelCapD / 2,
  };
}

// ATLAS HELMET — a front-facing cylinder drum (axis +Z, flat disc = face)
// wearing two concentric proud rings + ear pods. Male neck ball below (the
// torso supplies the socket); ball center = origin.
function helmet(add, p) {
  const y0 = ballTop(ATLAS_JP.neck), R = p.headR;
  maleBall(add, ATLAS_JP.neck, +1);                   // shaft up into the helmet
  add(translate(cylinder(0.14, 0.05, 14), 0, y0, 0));
  const cy = y0 + R + 0.04;                          // drum center height
  const fz = p.headD / 2;                            // face plane
  add(translate(rotX(cylinder(R, p.headD, 24), HPI), 0, cy, -fz));      // drum, face forward
  add(translate(rotX(cylinder(R + 0.03, 0.06, 24), HPI), 0, cy, fz));   // face rim ring
  add(translate(rotX(cylinder(p.innerR, 0.05, 20), HPI), 0, cy, fz + 0.06)); // inner face ring
  for (const s of [1, -1])                           // ear pods on the drum sides
    add(translate(rotZ(cylinder(0.09, 0.06, 14), s * HPI), s * (R + 0.06), cy, 0));
}

// ATLAS TORSO — a rounded slab chest (core box + vertical half-cylinder flanks),
// thin front panel, plain waist box below. Offers: neck socket (up), 2 shoulder
// seats on the flanks, and the waist BALL's male half below (the pelvis holds
// the socket). Ball center = the local origin.
function torso(add, p) {
  const L = torsoLayout(p);
  maleBall(add, ATLAS_JP.waist, +1);                                          // waist ball, shaft up
  add(translate(box(p.chestW * 0.55, L.taperH + 0.06, p.chestD * 0.75), 0, L.y0 + L.taperH / 2, 0));
  const cw = p.chestW - 2 * L.r;
  add(translate(box(cw, p.chestH, 2 * L.r), 0, L.chestY + p.chestH / 2, 0));
  for (const s of [1, -1])
    add(translate(rotY(halfCylinder(L.r, p.chestH, 16), s * HPI), s * cw / 2, L.chestY, 0));
  add(translate(box(cw * 0.85, p.chestH * 0.72, 0.06), 0, L.chestY + p.chestH * 0.56, L.r + 0.01));
  add(translate(cylinder(0.17, 0.1, 16), 0, L.top, 0));
  socketAt(add, ATLAS_JP.neck, [0, L.neckY, 0]);      // neck socket, opening up
  // shoulders: the torso only offers the SEAT — a cut cone flaring out of the
  // flank; the whole hinge belongs to the upper arm.
  for (const s of [1, -1])
    add(translate(rotZ(coneCut(L.discR + 0.07, L.discR, L.coneLen, 24), -s * HPI),
      s * (p.chestW / 2 - L.coneLen), L.sy, 0));
}

// ATLAS PELVIS — waist BALL socket on top (3 DOF; the torso brings the male
// ball), a flat disc under it and a half-cylinder shell as the body, hip female
// Us + pins on the dome's flat end faces. Rig root: the waist ball center = origin.
function pelvis(add, p) {
  const L = pelvisLayout(p);
  socketAt(add, ATLAS_JP.waist, [0, 0, 0]);                                   // waist socket, opening up
  add(translate(cylinder(L.discR, L.discT, 28), 0, L.discY, 0));
  add(translate(rotY(rotX(halfCylinder(p.hipH, L.domeW, 20), HPI), HPI), -L.domeW / 2, L.discY, 0)); // dome shell, flat up
  for (const s of [1, -1]) {
    const seat = (g) => {
      let h = rotX(g, HPI);
      if (s > 0) h = rotY(h, Math.PI);
      add(translate(h, s * L.hipX, L.hipY, 0));
    };
    buildJoint("hinge", seat, () => {}, ATLAS_JP.hip);
  }
}

// ATLAS UPPER ARM — shoulder MOVING half on top (solid tongue + disc base into
// the arm; the torso holds the clevis + pin), biceps cylinder, elbow clevis +
// pin at the bottom. The arm owns the WHOLE shoulder hinge1.
// RUNTIME pose (radians): pose.swing rotates the male tongue about the pin;
// everything below rides that swing.
function upperArm(add, p, pose = {}) {
  const L = upperArmLayout(p);
  const h = p.len + 0.08;
  const sw = pose.swing || 0;
  const seat = (g) => add(rotX(g, HPI));         // joint local -> part frame
  const limb = (g) => (sw ? seat(rotY(rotX(g, -HPI), sw)) : add(g));
  buildJoint("hinge", seat, seat, ATLAS_JP.shoulder, { pose: { swing: sw } });
  limb(translate(cylinder(p.w / 2, h, 20), 0, L.y0 + 0.06 - h, 0));
  limb(translate(rotZ(cylinder(p.w * 0.4, p.w + 0.14, 14), -HPI), -(p.w + 0.14) / 2, L.y0 - p.len, 0));
  hingeFixedAt(limb, ATLAS_JP.elbow, L.elbowY);
}

// ATLAS FOREARM — a box running up into the elbow clevis (replacing the tongue's
// base plate) and down to the hinge2 wrist's STAGE-A clevis + pin.
function forearm(add, p) {
  const L = forearmLayout(p);
  hingeMale(add, ATLAS_JP.elbow, { male: { noBase: 1 } });   // the box IS the tongue's base
  add(translate(box(p.w, L.boxTop - L.boxBot, p.w * 0.9), 0, (L.boxTop + L.boxBot) / 2, 0));
  hingeFixedAt(add, ATLAS_JP.wrist, L.wristY);
}

// ATLAS WRIST — the MIDDLE link of the hinge2 wrist: stage-A male tongue at the
// origin plugging the forearm's clevis (pin = X, bend), and below it the WHOLE
// stage-B hinge (pin = Z, tilt) with its male tongue. Both stages SHARE stage
// B's base. The stage-B male's DISC base is what the palm bolts to.
// RUNTIME pose (radians): pose.tilt swings the stage-B male about its pin.
function wrist(add, p, pose = {}) {
  hingeMale(add, ATLAS_JP.wrist, { male: { noBase: 1 } });
  const at = (g) => add(translate(rotY(g, HPI), 0, wristMidY(), 0));
  // stage-B: a plain hinge with disc bases; the male swings by -tilt about the pin
  const h = createHinge(ATLAS_JP.wrist.size, ATLAS_JP.wrist.slim);
  h.female(at); h.base(at, { male: false, disc: true });
  const mv = (g) => at(rotX(g, -(pose.tilt || 0)));
  h.male(mv); h.base(mv, { male: true, disc: true });
}

// ATLAS PALM — a gripper block sized to the forearm, bolted to the wrist's
// stage-B male disc (the origin) — it twists WITH that disc. Fingers hang off
// the block's front and back side faces, each bringing its own knuckle pin.
function palm(add, p) {
  const L = palmLayout(p);
  add(translate(box(p.w, p.h, p.d), 0, L.blockY, 0));
}

// ATLAS FINGER — 3 identical box digits strung on bare knuckle pins; each digit
// carries a short horizontal cylinder (axis X, bend) at its origin — the first
// is the pin the palm's side face hangs the finger from.
// RUNTIME pose: pose.curl (radians from the rig) bends both inner pins.
function finger(add, p, pose = {}) {
  const curl = pose.curl ?? rad(p.curl);
  let at = add;                                      // current digit frame, origin = its pin
  for (let i = 0; i < 3; i++) {
    const w = p.w * (1 - i * 0.12), L = p.digitLen, span = w + 0.02;
    at(translate(rotZ(cylinder(w * 0.45, span, 14), -HPI), -span / 2, 0, 0)); // pin, proud both faces
    at(translate(box(w, L + 0.05, w), 0, -(L + 0.05) / 2 + 0.02, 0));
    if (i === 2) break;
    const cur = at, py = -L;
    at = (g) => cur(translate(rotX(g, -curl), 0, py, 0));   // digits arch INTO the palm
  }
}

// ATLAS THIGH — hip MOVING half on top (solid tongue + disc base into the
// thigh), thigh box, knee clevis + pin below.
function thigh(add, p) {
  const L = thighLayout(p);
  buildJoint("hinge", () => {}, (g) => add(rotX(g, HPI)), ATLAS_JP.hip);
  add(translate(box(p.w, p.len + 0.1, p.w + 0.04), 0, L.y0 - (p.len + 0.1) / 2 + 0.07, 0));
  add(translate(rotZ(cylinder(p.w * 0.38, p.w + 0.16, 14), -HPI), -(p.w + 0.16) / 2, L.y0 - p.len, 0));
  hingeFixedAt(add, ATLAS_JP.knee, L.kneeY);
}

// ATLAS SHIN — male knee U on top, shin barrel, ankle clevis + pin at the bottom.
function shin(add, p) {
  const L = shinLayout(p);
  const h = p.len + 0.06;
  hingeMale(add, ATLAS_JP.knee);
  add(translate(cylinder(p.w / 2, h, 20), 0, L.y0 + 0.04 - h, 0));
  hingeFixedAt(add, ATLAS_JP.ankle, L.ankleY);
}

// ATLAS FOOT — solid male ankle tongue on the ANKLE BASE box; a slope box + flat
// toe box run forward, a heel base box + tapering cap run back. Every piece
// shares FOOT_H, so the sole stays one plane.
function foot(add, p) {
  const L = footLayout(p);
  hingeMale(add, ATLAS_JP.ankle);
  add(translate(box(p.w, FOOT_H, ANKLE_D), 0, L.midY, 0));
  add(translate(box(p.w, FOOT_H, L.footD, FOOT_SLOPE), 0, L.midY, L.footZ));
  add(translate(box(p.w * 0.92, L.toeH, TOE_D), 0, L.soleY - FOOT_H + L.toeH / 2, L.toeZ));
  add(translate(box(p.w, FOOT_H, p.heelD), 0, L.midY, L.heelZ));
  add(translate(rotY(box(p.w, FOOT_H, p.heelCapD, 0.7), Math.PI), 0, L.midY, L.heelCapZ));
}

// PART SLOTS — mount = the part's own MALE joint half (n points at the parent);
// every other slot is a FEMALE joint offered to a child. All in part space.
function atlasSlots(name, p) {
  switch (name) {
    case "head":
      return { mount: { pos: [0, 0, 0], n: [0, -1, 0], f: [0, 0, 1] } };
    case "torso": {
      const L = torsoLayout(p);
      return {
        mount: { pos: [0, 0, 0], n: [0, -1, 0], f: [0, 0, 1] },
        neck: { pos: [0, L.neckY, 0], n: [0, 1, 0], f: [0, 0, 1] },
        shoulderL: { pos: [-L.sx, L.sy, 0], n: [-1, 0, 0], f: [0, 1, 0] },
        shoulderR: { pos: [L.sx, L.sy, 0], n: [1, 0, 0], f: [0, 1, 0] },
      };
    }
    case "pelvis": {
      const L = pelvisLayout(p);
      return {
        waist: { pos: [0, 0, 0], n: [0, 1, 0], f: [0, 0, 1] },   // pivot barrel top
        // both hip slots share one frame so the legs seat un-mirrored and the
        // feet keep facing +Z
        hipL: { pos: [-L.hipX, L.hipY, 0], n: [-1, 0, 0], f: [0, 1, 0] },
        hipR: { pos: [L.hipX, L.hipY, 0], n: [-1, 0, 0], f: [0, 1, 0] },
      };
    }
    case "upperArm": {
      const L = upperArmLayout(p);
      return {
        mount: { pos: [0, 0, 0], n: [1, 0, 0], f: [0, 1, 0] },
        elbow: { pos: [0, L.elbowY, 0], n: [0, -1, 0], f: [1, 0, 0] },  // f = pin axis
      };
    }
    case "forearm": {
      const L = forearmLayout(p);
      return {
        mount: { pos: [0, 0, 0], n: [0, 1, 0], f: [1, 0, 0] },
        wrist: { pos: [0, L.wristY, 0], n: [0, -1, 0], f: [1, 0, 0] },  // hinge2 stage-A pin
      };
    }
    case "wrist":
      return {
        mount: { pos: [0, 0, 0], n: [0, 1, 0], f: [1, 0, 0] },          // stage-A pin (X, bend)
        pin: { pos: [0, wristMidY(), 0], n: [0, -1, 0], f: [0, 0, 1] }, // stage-B pin (Z, tilt)
        out: { pos: [0, wristMidY() - hingeReach(ATLAS_JP.wrist), 0], n: [0, -1, 0], f: [0, 0, 1] },
      };
    case "palm": {
      const L = palmLayout(p);
      return {
        mount: { pos: [0, 0, 0], n: [0, 1, 0], f: [0, 0, 1] },          // on the stage-B male disc
        f0: { pos: [0, L.knuckleY, -L.fz], n: [0, -1, 0], f: [-1, 0, 0] },
        f1: { pos: [-L.fx, L.knuckleY, L.fz], n: [0, -1, 0], f: [1, 0, 0] },
        f2: { pos: [L.fx, L.knuckleY, L.fz], n: [0, -1, 0], f: [1, 0, 0] },
      };
    }
    case "finger":
      return { mount: { pos: [0, 0, 0], n: [0, 1, 0], f: [1, 0, 0] } };
    case "thigh": {
      const L = thighLayout(p);
      return {
        mount: { pos: [0, 0, 0], n: [1, 0, 0], f: [0, 1, 0] },
        knee: { pos: [0, L.kneeY, 0], n: [0, -1, 0], f: [1, 0, 0] },
      };
    }
    case "shin": {
      const L = shinLayout(p);
      return {
        mount: { pos: [0, 0, 0], n: [0, 1, 0], f: [1, 0, 0] },
        ankle: { pos: [0, L.ankleY, 0], n: [0, -1, 0], f: [1, 0, 0] },
      };
    }
    case "foot":
      return { mount: { pos: [0, 0, 0], n: [0, 1, 0], f: [1, 0, 0] } };
  }
  return {};
}

const PART_BUILDERS = { head: helmet, torso, pelvis, upperArm, forearm, wrist, palm, finger, thigh, shin, foot };
const withDefaults = (name, p) => ({ ...ATLAS_PARAMS[name], ...(p || {}) });

export function buildPart(name, add, p = null, pose = null) {
  PART_BUILDERS[name](add, withDefaults(name, p), pose || {});
}
export function partSlots(name, p = null) {
  return atlasSlots(name, withDefaults(name, p));
}

// the kit the rig consumes: geometry + slots, keyed by part name
export const ATLAS_KIT = {
  build: buildPart,
  slots: partSlots,
};
