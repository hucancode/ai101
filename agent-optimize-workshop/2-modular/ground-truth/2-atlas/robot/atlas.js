// ATLAS RIG — the link table, and the short walk that assembles it on the engines.
//
// A link says four things and no more: which part, whose face it hangs off, which
// MECHANISM joins them, and where the limb should AIM. Everything else — the joint's
// size, its hardware, the seating position, the rest rotation, the bones — the joint
// engine derives from the child's plug and the parent's face. There is no slot table
// to keep in step with the geometry, no per-joint size to tune, and no mirrored
// geometry: a face on the left flank has a left-pointing normal, so its joint's pin
// flips with it and both flanks share one channel.
//
// `drive` maps a pose channel onto a bone the mechanism produced (`pin`, `collar`,
// `pinA`, `pinB`, `twist`, `rx/ry/rz`). "flip" negates the channel on the right flank.
// Whether that reads as mirrored or parallel depends on where the bone got its axis:
//   - from the ANCHOR (a spin collar): it already mirrors with the face, so a flip
//     makes both arms swing FORWARD together.
//   - from the child's own forward-stable frame (the wrist's tilt and twist): that
//     frame is identical on both flanks, so with no flip the two hands CLONE each
//     other. The flip is what mirrors them.
import { group, frameNode, attachMesh, groundY, rad, colorMemo } from "../gfx.js";
import { build as buildJoint } from "../engines/joint.js";
import { ATLAS_KIT } from "./parts.js";

export const ATLAS_POSE = {
  headYaw: 0, headPitch: 0, twist: 0, waistBend: 0, waistTilt: 0,
  shoulder: 0, armOut: -20, elbow: 60,
  wristBend: 0, wristTilt: 30, wristTwist: 0, curl: 30,
  hip: 0, knee: 0,
};

export const RANGES = {
  headYaw: [-60, 60], headPitch: [-30, 30],
  twist: [-45, 45], waistBend: [-30, 30], waistTilt: [-20, 20],
  shoulder: [-60, 120], armOut: [-180, 0], elbow: [-120, 120],
  wristBend: [-60, 60], wristTilt: [-45, 45], wristTwist: [-90, 90],
  curl: [0, 90], hip: [-45, 60], knee: [0, 90],
};

// the legs hold the rig up: a beat that swings them dances it off its own feet, so
// they stay hand-only — a slider, never a channel the choreographer sees.
export const LEGS = ["hip", "knee"];

// ONE curl channel, THREE digits: each answers to its OWN THIRD of the channel's
// travel. The knuckle bends over curl 0..30 then holds, the middle takes over 30..60,
// the tip finishes 60..90 — the finger rolls shut from the base outward.
//
// The ARCS are capped (45/35/25, not 90/90/90) because three quarter-turns coil a
// chain straight back where it began: at 90 each, the digits fold up THROUGH the palm.
// 105 degrees of total travel is what these segment lengths close through while the
// tips stay under the palm. `check.mjs` asserts it, so a re-tune that folds the hand
// into itself fails the check instead of shipping.
const CURL = [
  { in: [0, 30], out: [0, -45] },     // knuckle: leads, then holds
  { in: [30, 60], out: [0, 35] },    // middle:  takes over where the knuckle stops
  { in: [60, 90], out: [0, 25] },    // tip:     closes the fist
];

// one flank. `s` = +1 left, -1 right — it selects the parent's face, nothing else.
// No geometry is mirrored and no drive sign is flipped by hand.
const side = (S, s) => [
  // the shoulder is a hinge that also SPINS in its seat (collar): the spin swings the
  // arm fore-and-aft, the pin lifts it out. It hangs off the flank, aiming down.
  { name: `arm${S}`, part: "upperArm", parent: "torso", at: `shoulder${S}`,
    joint: "hinge", collar: true, aim: "against", side: s,
    drive: { collar: ["shoulder", "flip"], pin: ["armOut"] } },
  { name: `fore${S}`, part: "forearm", parent: `arm${S}`, at: "elbow",
    joint: "hinge", side: s, drive: { pin: ["elbow"] } },
  // the wrist is ONE joint to the rig: a universal — two pins at right angles plus a
  // twist collar. The engine stacks the stages; the palm just plugs into it.
  { name: `palm${S}`, part: "palm", parent: `fore${S}`, at: "wrist",
    joint: "universal", collar: true, side: s,
    drive: { pinA: ["wristBend"], pinB: ["wristTilt", "flip"], twist: ["wristTwist", "flip"] } },
  // fingers: three digits chained, hanging off a palm face and aiming down. Finger 0
  // sits on the BACK face, so its pin comes out reversed and one curl channel closes
  // it onto the front pair — `roll` turns it to face them, and its whole chain with it.
  // Each digit answers to its OWN SLICE of the curl channel (see CURL): a knuckle
  // leads, the next takes over as it runs out, the tip finishes. Giving all three the
  // same angle is what makes a finger fold through itself.
  ...[0, 1, 2].flatMap((f) => [0, 1, 2].map((j) => ({
    name: `d${S}${f}${j}`, part: "digit", side: s,
    parent: j === 0 ? `palm${S}` : `d${S}${f}${j - 1}`,
    at: j === 0 ? `f${f}` : "tip",
    joint: "hinge", ...(j === 0 ? { aim: "along", roll: f === 0 ? 180 : 0 } : {}),
    drive: { pin: ["curl", CURL[j]] },
  }))),
  { name: `leg${S}`, part: "thigh", parent: "pelvis", at: `hip${S}`,
    joint: "hinge", collar: true, aim: "along", side: s,
    drive: { collar: ["hip", "flip"] } },
  { name: `shin${S}`, part: "shin", parent: `leg${S}`, at: "knee",
    joint: "hinge", side: s, drive: { pin: ["knee"] } },
  { name: `foot${S}`, part: "foot", parent: `shin${S}`, at: "ankle", joint: "hinge", side: s },
];

export const ATLAS_LINKS = [
  { name: "pelvis", part: "pelvis" },                              // the root
  { name: "torso", part: "torso", parent: "pelvis", at: "waist", joint: "ball",
    drive: { rx: ["waistBend"], ry: ["twist"], rz: ["waistTilt"] } },
  { name: "head", part: "head", parent: "torso", at: "neck", joint: "ball",
    drive: { rx: ["headPitch"], ry: ["headYaw"] } },
  ...side("L", 1),
  ...side("R", -1),
];

// A drive is `[channel]`, `[channel, "flip"]`, or `[channel, { in, out }]` — the
// slice of the channel's travel this bone answers to, and the arc it bends through
// while it does. Outside the slice the bone holds at either end of its arc.
function slice(value, opts) {
  if (!opts || typeof opts === "string") return value;
  const [a, b] = opts.in, [c, e] = opts.out;
  return c + (e - c) * Math.min(1, Math.max(0, (value - a) / (b - a)));
}

// ---- assemble --------------------------------------------------------------
// Walk the links. Each one: build the part, hand its plug section and the parent's
// face to the joint engine, hang the female hardware on the parent, chain the bones
// it hands back, and hang the child on the last one. Nothing is computed here.
function assemble(kit, links, { basePose = {}, colorFn }) {
  const root = group(null);
  const node = {};          // link -> the node its part's geometry hangs on (= part space)
  const boneOf = {};        // link -> { boneName: Group }
  const parts = {};
  const seams = [];         // what each joint claims to have done — for `check.mjs`
  const hang = (n, meshes) => meshes.forEach((m) => attachMesh(n, m, colorFn(m.userData.id)));

  for (const d of links) {
    const part = (parts[d.name] = kit.build(d.part, d.params ?? null));
    if (!d.parent) { node[d.name] = group(root); hang(node[d.name], part.meshes); continue; }

    const anchor = parts[d.parent].anchors[d.at];
    if (!anchor) throw Error(`${d.name}: ${d.parent} offers no face "${d.at}"`);
    const j = buildJoint(d.joint, anchor, part.root, { collar: d.collar, aim: d.aim, roll: d.roll });

    hang(node[d.parent], j.fixed);                                  // the female half
    let host = node[d.parent];
    boneOf[d.name] = {};
    for (const b of j.bones) {
      const bone = group(b.rest ? frameNode(host, b.rest) : host);  // static rest, free rotation
      hang(bone, b.meshes);                                         // the moving half rides it
      boneOf[d.name][b.name] = { bone, axis: b.axis, sign: b.sign };
      host = bone;
    }
    node[d.name] = group(host, j.childOffset);                      // the child's own space
    node[d.name].userData.link = d.name;
    hang(node[d.name], part.meshes);
    seams.push({
      link: d.name, parent: node[d.parent], anchor, child: node[d.name],
      centre: Object.values(boneOf[d.name])[0].bone,
      seat: j.dims.seat, reach: j.dims.reach,
    });
  }

  // The engine says which local axis each bone turns about and which way it faces on
  // this flank. A channel therefore drives both sides through ONE number: a mirrored
  // face gives a mirrored pin, and the motion comes out symmetric. `parallel` is the
  // exception — a channel whose sense should survive the mirror (both arms swing
  // forward, not apart), which only the two spin collars need.
  function pose(p = {}) {
    const o = { ...basePose, ...p };
    for (const d of links)
      for (const [name, [ch, opts]] of Object.entries(d.drive ?? {})) {
        const b = boneOf[d.name][name];
        if (!b) throw Error(`${d.name}: a ${d.joint} has no bone "${name}"`);
        const flank = opts === "flip" ? d.side ?? 1 : 1;
        b.bone.rotation[b.axis] = rad(slice(o[ch] ?? 0, opts)) * b.sign * flank;
      }
  }

  pose(basePose);
  groundY(root);
  return { root, pose, seams };
}

let _rig = null, _seed = null;
export function createAtlasRig(seed = 1) {
  if (!_rig || _seed !== seed) {
    _rig = assemble(ATLAS_KIT, ATLAS_LINKS, { basePose: ATLAS_POSE, colorFn: colorMemo(seed) });
    _seed = seed;
  }
  return _rig;
}
export function atlasModel(seed = 1, pose = {}) {
  const rig = createAtlasRig(seed);
  rig.pose(pose);
  return rig.root;
}
