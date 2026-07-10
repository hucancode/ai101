# Prompt 04 — robot from primitives and joints

## Task

Three layers, strict discipline between them. Primitives build joints. Joints +
primitives build parts. Parts model the robot. The rig only instantiates parts and
connects and drives them.

Build a standing humanoid (Atlas-style).

---

## Layer 1 — skeleton (`skeleton.js`)

Rig machinery. Knows nothing of any particular robot.

- A **bone** is ONE rotation about ONE axis, seated at `offset` in the parent
  frame, with an optional fixed REST rotation:
  `world(bone) = world(parent) ∘ T(offset) ∘ REST ∘ R(axis, angle)`.
- A 3-DOF joint = 3 chained bones, x → y → z (`addBall`). Unused axes stay 0.
- **Slot matching** (`matchRot`) — the rest rotation that seats a child slot
  against a parent slot: positions coincide (that's the bone offset), forwards
  **align**, normals **oppose**. `slotFrame` turns `{ pos, n, f }` into a 3x3
  frame.
- `createSkeleton()` — add bones, FK `resolve()`. Plus `setBall`, `mirrorSlot`,
  `createMeshCache`, and `xf` transform-pair helpers.

## Layer 2 — parts (`parts.js`)

A part is a body-piece builder `(add, params, pose) => void`, composed from
primitives + joint **halves**.

A part embeds:

- the **FIXED** half of every joint it offers to children — female socket, or
  female U + pin — at its distal slots;
- the **MOVING** half of the joint that plugs it into its parent — male ball, or
  male tongue — at its mount slot, which is the part's **local origin**.

The two halves of one joint live in two different parts but share **one** joint
param entry, so they always align when the rig glues the slots. The rig's bone at
the match point supplies the rotation the mechanism absorbs.

**Local frame**: mount slot = local origin (ball center, or pin axis). Body hangs
along **−Y**, **+Z** forward. Exception: head and torso, whose bodies grow **+Y**
out of their mount.

Every part has a **layout function** computing its mounting numbers once, off the
joint dims (`jointMounts` / `hingeDims` / `ballDims`). BOTH the builder and the
slot function consume it, so slots can never drift from geometry.

### Joint assignments

| joint | mechanism | halves live in |
|---|---|---|
| neck | `ball1` | torso holds the socket, head brings the male ball |
| waist | `ball1`, 3 DOF: twist + bend + tilt | pelvis holds the socket, torso brings the ball |
| shoulder / hip | `hinge1Block` — solid tongue, disc bases | the **limb owns the whole hinge**; the body part offers only the cut-cone seat its mount-1 disc lands on |
| elbow / knee / ankle | `hingeBlock` | parent holds female U + pin, child brings the male tongue |
| wrist | `hinge2` — stages A then B, pins X then Z | forearm carries stage-A clevis; the `wrist` link IS the middle piece; the palm bolts to the stage-B male disc |
| knuckles | bare pins, no clevis | each finger carries its own knuckle pin |

Atlas hinges run `pinOut = 0`: the pin stops at the female arms instead of poking
out of the clevis.

### The 11 parts

- **head** — front-facing cylinder drum: axis +Z, flat disc = the face, wearing two
  concentric proud rings, ear pods on the drum sides. Male neck ball below.
- **torso** — rounded slab chest (core box + vertical half-cylinder flanks), thin
  front panel, plain waist box below it. No belly; the torso sits directly on the
  pelvis. Offers: neck socket (up), a **cut-cone seat** on each flank (the whole
  shoulder hinge belongs to the arm), and the waist ball's **male** half below.
  Ball center = local origin.
- **pelvis** — the rig root. Waist ball **socket** on top, flat disc under it,
  half-cylinder shell (axis X, dome down) as the body, hip female Us + pins on the
  dome's flat end faces.
- **upperArm** — shoulder moving half on top (solid tongue + disc base seated so
  the disc drops into the arm), biceps cylinder, elbow clevis + pin below.
- **forearm** — a box running **up into** the elbow clevis, taking the place of the
  tongue's base plate. It is narrower than the female arm gap, and stops a
  clearance short of the pin, so only the tongue's knuckle disc stands proud of it.
  Below: the hinge2 wrist's stage-A clevis + pin. A **4-plank shroud** (open top
  and bottom) sleeves the box down to the wrist pin plane and no further, boxing
  the clevis arms in without fouling the swing.
- **wrist** — the middle link of the hinge2 wrist. Stage-A male tongue at the
  origin, plugging the forearm's clevis (pin X, bend). Directly below, the WHOLE
  stage-B hinge: clevis + pin turned 90° (pin Z, tilt) and the male tongue riding
  it. Both stages share stage B's base, so the stage-A male emits none. Pose:
  `tilt`.
- **palm** — a plain block, bolted to the wrist's stage-B male disc (the origin).
  The block twists WITH that disc — that is the wrist's third DOF. No knuckle
  clevises: fingers hang off the block's front and back side faces.
- **finger** — 3 box digits, square-tipped, strung on **bare knuckle pins**. No
  clevis anywhere: each digit carries a short horizontal cylinder (axis X) at its
  own origin. The first of them is the pin the palm hangs the finger from. Pose:
  `curl` bends the two inner pins; digits arch INTO the palm.
- **thigh** — hip moving half on top, thigh box, knee clevis + pin below.
- **shin** — male knee U on top, shin barrel, ankle clevis + pin below.
- **foot** — built around the **ankle base**: a flat box centered under the ankle
  pin, so the joint stands on level ground. Forward off it: a slope box tapering
  into a flat toe box. Rearward: a heel base box, then a slope box tapering down.
  Every piece shares one height, so the sole is a single plane, toe to heel.

### Part slots

`atlasSlots(name, params)` → each part's slots as `{ pos, n, f }` frames in part
space. `mount` = the part's own moving half, `n` points at the parent. The rest are
fixed halves offered to children:

```
head    mount
torso   mount neck shoulderL shoulderR
pelvis  waist hipL hipR
upperArm mount elbow      forearm mount wrist
wrist   mount pin out     palm  mount f0 f1 f2
finger  mount             thigh mount knee
shin    mount ankle       foot  mount
```

On hinge slots, `f` = the pin axis. Both hip slots share **one** frame, so the legs
seat un-mirrored and both feet face +Z.

## Layer 3 — rig (`rig.js`)

**Declarative link list.** Each link names its part, its parent, parent slot ↔ own
slot, and an `angles` map from bone axis → `[pose key, sign]`. Pelvis is the root.
One function generates both sides. The right arm seats with a `rotY(π)` rest — its
shoulder disc must face the chest — which flips its local axis senses. Absorb that
in **per-side signs**, never in special-cased geometry.

**Two link flags** for joints a part owns internally:

- **`swingBone`** — the link owns BOTH halves of its mount hinge (the arm owns the
  whole shoulder). The named bone's rotation IS the pin swing, so it must not turn
  the part's fixed half: it goes to the part's pose channel instead, and the part
  is placed by the bone ABOVE it.
- **`pinBone`** — the link owns a hinge further down its own body (the wrist's
  stage B). An extra bone sits at that pin. The children ride it, the part does
  not, and its angle feeds the part's pose channel.

**Root lift.** Solve it from the built figure — push the root up by the lowest
vertex it puts underground — so the soles stand on the grid whatever the part
params are. The same sweep gives the standing height, which frames the camera.

**Build / frame split.** `createAtlasRig(seed)` compiles part slots, the skeleton
(offsets + rest rotations), and a static geometry **template** per pose-less part,
once. Per frame, `model(pose)` sets bone angles, FK-resolves, and composes each
part's cached template through its bone world — pure matrix composition, no vertex
work. Only parts with a live pose channel rebuild geometry: the fingers, and the
`swingBone` / `pinBone` links.

**Item tags.** Every item carries `group` (`link:jointGroup`), `depth` (chain
depth, root 0), and `an` — the **world assembly normal**: the link's mount-slot
normal in world space, negated. The side the part approaches from. A build
animation eats all three.

**Exports for later.** `ATLAS_POSE_DEPTH` derives each pose channel's chain depth
from the skeleton — a channel drives the link it sits on, so its depth IS that
link's depth. `ATLAS_MONTAGES` holds rehearsed keyframe routines. A pose driver
eats both.

## Pose channels — 14, degrees

```
headYaw headPitch twist waistBend waistTilt
shoulder armOut elbow wristBend wristTilt wristTwist curl
hip knee
```

Each drives BOTH sides. `twist / waistBend / waistTilt` articulate the waist ball.
`shoulder / armOut` drive the shoulder `hinge1Block` — `spinF` vs the pin swing.
`elbow / knee` bend hinges. `wristBend / wristTilt` drive the two hinge2 stages.
`wristTwist` turns the palm on the stage-B disc. `curl` curls all 6 fingers'
internal digits.

## Deliver

`skeleton.js`, `parts.js`, `rig.js`, `main.js`, `index.html`.
`atlasModel(seed, pose)` → `{ items, meshes }`; items carry
`{ key, mesh, m, t, color, group, an, depth }`. Demo draws `items`, idle-animated.

A complete humanoid stands on the grid: head, torso, pelvis, 2 arms with 3-finger
grippers, 2 legs with feet. Right side mirrors left. Every mechanism stays meshed
at any pose in slider range — tongues inside their clevises, balls in their
sockets. Static parts reuse their captured template; no per-frame geometry
regeneration outside the flagged links.
