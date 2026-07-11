// ATLAS RIG — the link table (which part hangs off which, which female slot each
// male slot seats against, which pose channel drives each bone axis) AND the small
// walk that assembles it directly on the engines: the scene-graph helpers carry the
// bones + geometry as a Three graph, the joint engine solves each seating rotation,
// the parts supply the meshes. No separate rig framework — a caller assembles its
// own figure like this and poses it by rotating bone nodes.
import { group, attachMesh, clearMeshes, groundY, rad, vSub, vScale, colorMemo } from "../gfx.js";
import { mate } from "../engines/joint.js";
import { ATLAS_KIT } from "./parts.js";

// runtime rig controls (degrees) — the sliders the choreographer drives
export const ATLAS_POSE = {
  headYaw: 0, headPitch: 0, twist: 0, waistBend: 0, waistTilt: 0,
  shoulder: 0, armOut: 30, elbow: 60,
  wristBend: 0, wristTilt: 30, wristTwist: 0, curl: 30,
  hip: 0, knee: 0,
};

// slider ranges, degrees
export const RANGES = {
  headYaw: [-60, 60], headPitch: [-30, 30],
  twist: [-45, 45], waistBend: [-30, 30], waistTilt: [-20, 20],
  shoulder: [-60, 120], armOut: [0, 120], elbow: [0, 120],
  wristBend: [-60, 60], wristTilt: [-45, 45], wristTwist: [-90, 90],
  curl: [0, 90], hip: [-45, 60], knee: [0, 90],
};

// the legs hold the rig up: a beat that swings them dances it off its own feet,
// so they stay a slider the hand may drag and a channel the choreographer never
// sees. `hip` turns the thigh, `knee` the shin.
export const LEGS = ["hip", "knee"];

// One flank of the symmetric rig. `sgn` (+1 left, -1 right) flips the per-side
// drive signs: the right arm seats with a rotY(pi) rest (its shoulder disc must
// face the chest), which reverses the LOCAL x/z senses. No geometry is
// mirrored — the slot frames place both flanks and the signs keep the motion
// symmetric. Each part plugs its "mount" (male) slot onto the parent's named
// FEMALE slot (`at`).
const side = (S, sgn) => [
  // arm: x = the shoulder disc turning in the torso's cone seat (rigid spin of
  // the whole joint), z = the pin swing (only the tongue takes it). geoBone "z"
  // hangs the arm on the bone above the swing; feed hands the swing to the part.
  { name: `arm${S}`, part: "upperArm", parent: "torso", at: `shoulder${S}`,
    drive: { x: ["shoulder", -sgn], z: ["armOut", -1] }, geoBone: "z", feed: { swing: "z" } },
  { name: `fore${S}`, part: "forearm", parent: `arm${S}`, at: "elbow",
    drive: { x: ["elbow", -sgn] } },
  // hinge2 wrist: bend rides stage-A's pin (X); tilt lives on a `pin` bone at
  // stage B and feeds the part's pose (only the tongue swings); the palm's
  // twist is the tongue's disc turning.
  { name: `wrist${S}`, part: "wrist", parent: `fore${S}`, at: "wrist",
    drive: { x: ["wristBend", -sgn] },
    pin: { at: "pin", axis: "z", drive: ["wristTilt", 1] }, feed: { tilt: "pin" } },
  { name: `palm${S}`, part: "palm", parent: `wrist${S}`, at: "out",
    drive: { y: ["wristTwist", sgn] } },
  ...[0, 1, 2].map((i) => ({
    name: `finger${S}${i}`, part: "finger", parent: `palm${S}`, at: `f${i}`,
    drive: { x: ["curl", -1] }, feed: { curl: "x" },
  })),
  { name: `leg${S}`, part: "thigh", parent: "pelvis", at: `hip${S}`,
    drive: { x: ["hip", -1] } },
  { name: `shin${S}`, part: "shin", parent: `leg${S}`, at: "knee",
    drive: { x: ["knee", 1] } },
  { name: `foot${S}`, part: "foot", parent: `shin${S}`, at: "ankle" },
];

export const ATLAS_LINKS = [
  { name: "pelvis", part: "pelvis", pivot: "waist" },
  // the waist is a ball: all three bones of the link carry a channel
  { name: "torso", part: "torso", parent: "pelvis", at: "waist",
    drive: { x: ["waistBend", 1], y: ["twist", 1], z: ["waistTilt", 1] } },
  { name: "head", part: "head", parent: "torso", at: "neck",
    drive: { x: ["headPitch", 1], y: ["headYaw", 1] } },
  ...side("L", 1),
  ...side("R", -1),
];

// ---- ASSEMBLE — walk the link table into a posable Three scene graph ---------
const AX = { x: 0, y: 1, z: 2 };

// a 3-DOF joint node = 3 chained single-axis Group bones x→y→z; the rest rides the first
const ballBones = (parent, offset, rest) => {
  const x = group(parent, offset, rest), y = group(x);
  return [x, y, group(y)];
};

// Each link is a 3-bone ball chain seated on its parent's slot (rest solved by the
// assembly engine). A part's STATIC geometry is hung on its bone once; an
// ARTICULATED part (feed) rebuilds its geometry per pose. Three composes every
// world transform and renders the graph — nothing is baked per frame.
function assemble(kit, links, { basePose = {}, colorFn }) {
  const defs = links.map((d) => ({ ...d, slots: kit.slots(d.part, d.params ?? null) }));
  const byName = Object.fromEntries(defs.map((d) => [d.name, d]));
  for (const d of defs) d.slots.slot0 = d.slots[d.parent ? (d.slot ?? "mount") : d.pivot];

  const root = group(null);
  const boneOf = {}, geoOf = {};
  const anchorOf = (d) => (d.pin ? d.slots[d.pin.at].pos : d.slots.slot0.pos);
  for (const d of defs) {
    const par = d.parent ? byName[d.parent] : null;
    const offset = par ? vSub(par.slots[d.at].pos, anchorOf(par)) : [0, 0, 0];
    const rest = par ? mate(par.slots[d.at], d.slots[d.slot ?? "mount"]) : null;
    d.ids = ballBones(par ? boneOf[d.parent] : root, offset, rest);
    boneOf[d.name] = d.ids[2];
    // geoBone: this link owns its mount joint; its fixed half must not turn with
    // the swing, so its geometry hangs on the bone above the swing
    geoOf[d.name] = d.geoBone ? d.ids[AX[d.geoBone] - 1] : d.ids[2];
    // pin: an extra bone at a joint down the body; children ride it, the part does not
    if (d.pin) {
      d.pinNode = group(d.ids[2], vSub(d.slots[d.pin.at].pos, d.slots.slot0.pos));
      boneOf[d.name] = d.pinNode;
    }
  }

  // build a part's meshes and hang them on its geo bone, shifted so the mount slot
  // sits on the bone. Colour comes from the shape id, so identical pieces match.
  const attachPart = (d, ppose) => {
    const shift = vScale(d.slots.slot0.pos, -1);
    kit.build(d.part, (g) => attachMesh(geoOf[d.name], g, colorFn(g.userData.id), shift),
      d.params ?? null, ppose);
  };

  // static parts: hung once (they never change shape, only their bones rotate)
  for (const d of defs) if (!d.feed) attachPart(d, null);

  function pose(p = {}) {
    const o = { ...basePose, ...p }, raw = {};
    for (const d of defs) {
      const r = {};
      if (d.pin) { const [k, s] = d.pin.drive; r.pin = s * rad(o[k]); d.pinNode.rotation[d.pin.axis] = r.pin; }
      for (const [axis, [k, s]] of Object.entries(d.drive ?? {})) {
        r[axis] = s * rad(o[k]); d.ids[AX[axis]].rotation[axis] = r[axis];
      }
      raw[d.name] = r;
    }
    // articulated parts: rebuild geometry with the fed pose (only the swung half
    // moves) — but only when that fed pose actually changed, so a still limb keeps
    // its meshes instead of churning them every frame.
    for (const d of defs) if (d.feed) {
      const ppose = Object.fromEntries(Object.entries(d.feed).map(([k, ref]) => [k, raw[d.name][ref] ?? 0]));
      const sig = Object.values(ppose).join(",");
      if (sig === d._fedSig) continue;
      d._fedSig = sig;
      clearMeshes(geoOf[d.name]);
      attachPart(d, ppose);
    }
  }

  pose(basePose);      // home pose: set every bone + build the feed parts once
  groundY(root);       // stand on the grid
  return { root, pose };
}

let _rig = null, _seed = null;
// the rig is a live Three graph: build once, then pose() mutates node rotations in
// place. Memoised per seed so a page adds one root to the scene and re-poses it.
export function createAtlasRig(seed = 1) {
  if (!_rig || _seed !== seed) {
    _rig = assemble(ATLAS_KIT, ATLAS_LINKS, { basePose: ATLAS_POSE, colorFn: colorMemo(seed) });
    _seed = seed;
  }
  return _rig;
}
// one-shot: build (or reuse) the rig, apply a pose, hand back the root node
export function atlasModel(seed = 1, pose = {}) {
  const rig = createAtlasRig(seed);
  rig.pose(pose);
  return rig.root;
}
