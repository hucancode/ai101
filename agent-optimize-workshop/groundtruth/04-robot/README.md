# 04 — Build Robot Using Primitives and Joints

Builds on 03 (joint blocks). New layers: the shared skeleton machinery, a part
kit, and a rig that assembles a standing humanoid (Atlas-style).

## Problem statement

Three layers, strict discipline between them: primitives build joints, joints +
primitives build parts, parts model the robot, and the rig only instantiates
parts and connects/drives them — **the rig never re-models geometry**.

### Skeleton (`skeleton.js`)

The rig machinery, independent of any particular robot:

- A **bone** is ONE rotation about ONE axis, seated at `offset` in the parent
  frame with an optional fixed REST rotation:
  `world(bone) = world(parent) ∘ T(offset) ∘ REST ∘ R(axis, angle)`.
  A 3-DOF joint = 3 chained bones x→y→z (`addBall`); unused axes stay at 0.
- **Slot matching** (`matchRot`): the rest rotation seats a child slot against
  a parent slot — positions coincide (the bone offset), forwards **align**,
  normals **oppose**. `slotFrame` turns `{ pos, n, f }` into a 3×3 frame.
- `createSkeleton()` (add + FK `resolve()`), `setBall`, `mirrorSlot`,
  `createMeshCache`, and the `xf` transform-pair helpers.

### Parts (`parts.js`)

A part is a body-piece builder `(add, params, pose) => void` composed from
primitives + joint **halves**. A part embeds the FIXED half of every joint it
offers to children (socket / female U + pin at its distal slots) and the MOVING
half of the joint that plugs it into its parent (male ball / male tongue at its
mount slot, which is the part's local origin). The two halves of one joint live
in two different parts but share one `ATLAS_JP` entry, so they always align
when the rig glues the slots; the rig's bone at the match point supplies the
rotation the mechanism absorbs.

**Local frame**: mount slot = local origin (ball center / pin axis), body
hanging along −Y, +Z forward — except head and torso, whose bodies grow +Y out
of their mount.

Every part has a **layout function** computing its mounting numbers once (joint
stack heights via `jointMounts`/`hingeDims`/`ballDims`), consumed by BOTH the
builder and `atlasSlots` — slots can never drift from geometry.

Joint assignments:

| joint | mechanism | halves live in |
|---|---|---|
| neck | `ball1` | torso holds the socket, head brings the male ball |
| waist | `ball1` (3 DOF: twist + bend + tilt) | pelvis holds the socket, torso brings the ball |
| shoulder / hip | `hinge1Block` (solid tongue, disc bases) | the limb owns the WHOLE hinge; the body part only offers the cut-cone seat its mount-1 disc lands on |
| elbow / knee / ankle | `hingeBlock` | parent holds female U + pin, child brings the male tongue |
| wrist | `hinge2` (stages A then B, pins X then Z) | forearm carries stage-A clevis, the `wrist` link is the middle piece, the palm bolts to the stage-B male disc |
| knuckles | bare pins, no clevis | each finger carries its own knuckle pin |

The kit — **11 parts**: `head` (front-facing drum helmet), `torso` (rounded slab
chest + shoulder cone seats + male waist ball), `pelvis` (the root: waist socket
+ disc + half-cylinder dome, hip female Us), `upperArm`, `forearm` (box running
up into the elbow clevis, 4-plank shroud over the wrist), `wrist` (the hinge2
middle link), `palm` (a plain block; the fingers hang off its side faces),
`finger` (3 box digits on bare pins, `pose.curl` bends both inner pins),
`thigh`, `shin`, `foot` (ankle base + slope + toe + heel, one sole plane).

`atlasSlots(name, params)` exposes each part's slots as `{ pos, n, f }` frames
in part space: `mount` = the part's own moving half (n points at the parent),
the rest = fixed halves offered to children (`neck`, `shoulderL/R`, `hipL/R`,
`elbow`, `wrist`, `pin`, `out`, `f0/f1/f2`, `knee`, `ankle`). On hinge slots,
`f` = the pin axis. Both hip slots share ONE frame so the legs seat un-mirrored
and both feet face +Z.

### Rig (`rig.js`)

- **Rig definition** (`ATLAS_DEF` + `atlasSide("L"/"R")`): a declarative link
  list — each link names its part, parent, parent slot ↔ own slot, plus an
  `angles` map from bone axes to `[pose key, sign]`. Pelvis is the root, lifted
  so the soles stand on the grid (solved from the built figure). One function
  generates both sides: the right arm seats with a `rotY(π)` rest (its shoulder
  disc must face the chest), which flips its local axis senses — absorbed in
  per-side signs, never in special-cased geometry.
- Two link flags handle joints a part owns internally:
  - **`swingBone`** — the link owns BOTH halves of its mount hinge (the arm
    owns the whole shoulder). The named bone's rotation IS the pin swing, so it
    must not turn the part's fixed half: it goes to the part's pose channel
    instead, and the part is placed by the bone ABOVE it.
  - **`pinBone`** — the link owns a hinge further down its own body (the wrist's
    stage B). An extra bone sits at that pin; the children ride it, the part
    doesn't, and its angle feeds the part's pose channel.
- **Build/frame split**: `createAtlasRig(seed)` compiles part slots, the
  skeleton (offsets + rest rotations), and a static geometry **template** per
  pose-less part, once. Per frame `model(pose)` sets bone angles, FK-resolves,
  and composes each part's cached template through its bone world — pure matrix
  composition, no vertex work. Only parts with a live pose channel (fingers, and
  the `swingBone`/`pinBone` links) rebuild geometry.
- Every item is tagged `group` (`link:jointGroup`), `depth` (chain depth, root
  0), and `an` (the **world assembly normal**: the link's mount-slot normal in
  world space, negated — the side the part approaches from). Problem 05 consumes
  all three.
- `ATLAS_POSE_DEPTH` derives each pose channel's chain depth from the skeleton,
  and `ATLAS_MONTAGES` holds rehearsed keyframe routines. Problem 06 consumes
  both.

## Scope

In scope: everything above. Out of scope: assembly animation (05),
choreography (06), any other robot (the source library also has a
spline-ridden dragon — not part of this problem).

## Data contract

`atlasModel(seed, pose)` → `{ items, meshes }`; items carry
`{ key, mesh, m, t, color, group, an, depth }`. The demo draws `items`.
Pose channels (degrees): `headYaw, headPitch, twist, waistBend, waistTilt,
shoulder, armOut, elbow, wristBend, wristTilt, wristTwist, curl, hip, knee`.

## Acceptance criteria

- A complete humanoid stands on the grid: head, torso, pelvis, 2 arms with
  3-finger grippers, 2 legs with feet. The right side mirrors the left.
- Every mechanism meshes at any pose within slider ranges: male tongues sit
  inside their clevises, balls in their sockets.
- Pose channels move the right things: `twist/waistBend/waistTilt` articulate
  the waist ball, `shoulder/armOut` the shoulder hinge1 (spinF vs pin swing),
  `elbow/knee` bend hinges, `wristBend/wristTilt` the two hinge2 stages,
  `wristTwist` turns the palm on the stage-B disc, `curl` curls all 6 fingers'
  internal digits.

## Run

```bash
python -m http.server 8000   # from workshop root
# open http://localhost:8000/04-robot/
```
