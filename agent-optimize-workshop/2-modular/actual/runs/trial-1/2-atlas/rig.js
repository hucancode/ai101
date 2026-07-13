// ATLAS — THE RIG. A link list, and the walk that hands it to the engines.
//
// A LINK says four things and no more: which PART, whose FACE it hangs off, which
// MECHANISM joins them, and where the limb should AIM. Everything else — the size of
// the joint, its hardware, its seating, its rest rotation, its bones — is derived by
// the joint engine from the child's own mount section. There is not a coordinate, an
// offset or a rest angle in this file.
//
// (`chan` names the bones the page and the choreographer drive; `roll` turns a part
// about its own mount. Both are naming/authoring, not geometry.)
//
// LEFT AND RIGHT are the SAME links on the SAME channels, hung off opposite faces. A
// mirrored face gives a mirrored pin, so no geometry is mirrored and no drive sign is
// flipped by hand. The exception is a channel whose SENSE must survive the mirror —
// both arms swing forward, not apart. Those are marked PARALLEL, and only the two
// spin collars need it.
import { group, frameNode, attachMesh, colorMemo, groundY, rad } from "./gfx.js";
import { build as buildJoint } from "./engines/joint.js";
import { PARTS } from "./parts.js";

const SEED = 4;

// ---- channels ------------------------------------------------------------------
// key -> [min, max] in degrees. The rest pose is 0 everywhere.
export const CHANNELS = {
  headYaw: [-60, 60], headPitch: [-35, 35],
  waistTwist: [-45, 45], waistBend: [-30, 30], waistTilt: [-25, 25],
  // armOut's sense comes out of the MIRRORED pin (raising is negative on both flanks);
  // the range is content, the sign is the engine's — it is not flipped here.
  shoulder: [-90, 90], armOut: [-90, 10], elbow: [-120, 10],
  wristBend: [-60, 60], wristTilt: [-40, 40], wristTwist: [-90, 90],
  curl: [0, 85],
  hip: [-45, 45], knee: [0, 90],
};

// a channel whose sense must SURVIVE the mirror: the two spin collars
const PARALLEL = new Set(["shoulder", "hip"]);

// the legs hold the mech up — the choreographer never sees them
export const HAND_ONLY = new Set(["hip", "knee"]);

// ---- the link list ---------------------------------------------------------------

// three digits chained make a finger; the first hangs off the palm face it is given
const knuckle = (at, roll) => ({
  part: "digit", at, via: "hinge", aim: "along", roll,
  chan: { pin: "curl" },
  kids: [{
    part: "digit", at: "tip", via: "hinge", aim: "along",
    chan: { pin: "curl" },
    kids: [{ part: "digit", at: "tip", via: "hinge", aim: "along", chan: { pin: "curl" } }],
  }],
});

// the arm: it hangs DOWN off a flank (against the torso's body) and spins in its seat
const arm = (side) => ({
  part: "upperArm", at: `shoulder.${side}`, via: "hinge", collar: true, aim: "against",
  chan: { collar: "shoulder", pin: "armOut" },
  kids: [{
    part: "forearm", at: "elbow", via: "hinge", aim: "along",
    chan: { pin: "elbow" },
    kids: [{
      part: "palm", at: "wrist", via: "universal", collar: true, aim: "along",
      chan: { pinA: "wristBend", pinB: "wristTilt", twist: "wristTwist" },
      // two fingers on the FRONT face; one on the BACK, whose face points the other
      // way — its pin comes out reversed, so the one curl channel CLOSES it onto the
      // other two, and `roll` turns it round to face them, chain and all.
      kids: [knuckle("finger.a", 0), knuckle("finger.b", 0), knuckle("thumb", 180)],
    }],
  }],
});

const leg = (side) => ({
  part: "thigh", at: `hip.${side}`, via: "hinge", collar: true, aim: "along",
  chan: { collar: "hip" },
  kids: [{
    part: "shin", at: "knee", via: "hinge", aim: "along",
    chan: { pin: "knee" },
    kids: [{ part: "foot", at: "ankle", via: "hinge", aim: "along", chan: {} }],
  }],
});

// the root is the pelvis; every other part is a link
export const RIG = [
  {
    part: "torso", at: "waist", via: "ball", aim: "against",
    chan: { ry: "waistTwist", rx: "waistBend", rz: "waistTilt" },
    kids: [
      { part: "head", at: "neck", via: "ball", aim: "along", chan: { ry: "headYaw", rx: "headPitch" } },
      arm("R"), arm("L"),
    ],
  },
  leg("R"), leg("L"),
];

// ---- assembly --------------------------------------------------------------------
// ONCE. The walk builds each joint from the anchor it hangs off and the child's own
// mount section, hangs the engine's hardware on the frames the engine put it in, and
// binds the bones to channels. A pose call only sets bone angles afterwards.

export function buildAtlas() {
  const colorOf = colorMemo(SEED);
  const bind = [];                                  // [{ key, node, axis, sign }]
  const joints = [];                                // for the check
  const hang = (node, meshes) => {
    for (const m of meshes) attachMesh(node, m, colorOf(m.userData.id));
  };

  const root = group(null);
  const rootPart = PARTS.pelvis();
  hang(root, rootPart.meshes);

  // a link that names a sided face (`shoulder.L`) declares the side; its whole chain
  // below inherits it, so `parallel` reaches the collars and nothing else
  const walk = (parentPart, parentNode, link, parentSide) => {
    const s = /\.([RL])$/.exec(link.at);
    const side = s ? s[1] : parentSide;
    const child = PARTS[link.part]();
    const anchor = parentPart.anchors[link.at];
    if (!anchor) throw Error(`rig: no anchor "${link.at}" on the parent of "${link.part}"`);
    const j = buildJoint(link.via, anchor, child.root, {
      collar: !!link.collar, aim: link.aim, roll: link.roll ?? 0,
    });
    if (!j.bones[0].rest) throw Error(`rig: "${link.via}" has no rest on its first bone`);
    hang(parentNode, j.fixed);                      // female hardware: already in parent space

    let host = parentNode, centre = null;
    for (const b of j.bones) {
      const node = group(b.rest ? frameNode(host, b.rest) : host);
      if (!centre) centre = node;                   // every joint's first bone sits ON the centre
      hang(node, b.meshes);
      const key = link.chan[b.name];
      if (key) {
        if (!CHANNELS[key]) throw Error(`rig: bone "${b.name}" bound to unknown channel "${key}"`);
        // a mirrored face already mirrors the pin; only a PARALLEL channel is un-mirrored
        const mirror = PARALLEL.has(key) && side === "L" ? -1 : 1;
        bind.push({ key, node, axis: b.axis, sign: b.sign * mirror });
      }
      host = node;
    }
    const childNode = group(host, j.childOffset);   // the child's own space
    hang(childNode, child.meshes);

    joints.push({ name: `${link.part}${side ?? ""}`, anchor, parentNode, centre, childNode, dims: j.dims, plug: child.root });
    for (const k of link.kids ?? []) walk(child, childNode, k, side);
  };

  for (const l of RIG) walk(rootPart, root, l, null);

  const pose = {};
  for (const k of Object.keys(CHANNELS)) pose[k] = 0;

  const setPose = (p) => {
    for (const b of bind) b.node.rotation[b.axis] = rad(p[b.key] ?? 0) * b.sign;
  };
  setPose(pose);
  groundY(root);                                    // it stands on the grid

  return { root, pose, setPose, joints, bind };
}
