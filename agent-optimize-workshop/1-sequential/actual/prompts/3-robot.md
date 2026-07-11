## Task

Primitives build joints. Joints + primitives build parts. Parts model the robot.
Instantiates parts and connects them to make the rig.

## Layer 1 — skeleton

Rig machinery. Knows nothing of any particular robot.

A **bone** is ONE rotation about ONE axis, seated at an offset in the parent
frame, with an optional fixed REST rotation:
`world(bone) = world(parent) ∘ T(offset) ∘ REST ∘ R(axis, angle)`.
A 3-DOF joint = 3 chained bones, x → y → z. Unused axes stay 0.

The REST rotation is the one that seats this part's slot against its parent's.
Add bones, resolve forward kinematics.

## Layer 2 — parts

A part is a body-piece builder, composed from primitives + joint **halves**. It
embeds the FIXED half of every joint it offers a child, and the MOVING half of the
joint that plugs it into its parent

**Local frame**: mount = local origin. Body hangs −Y, +Z forward. Head and torso
grow +Y instead.

Each part publishes its mount slot plus one slot per joint it offers. 

### Joints — one row per connection

Female = fixed half. Male = moving half.

| joint | joins | mechanism | female | male |
|---|---|---|---|---|
| neck | torso → head | ball | torso | head |
| waist | pelvis → torso | ball, 3 DOF | pelvis | torso |
| shoulder | torso → upperArm | mount-to-mount hinge | upperArm | upperArm |
| elbow | upperArm → forearm | hinge | upperArm | forearm |
| wrist A | forearm → wrist | universal, stage A | forearm | wrist |
| wrist B | wrist → palm | universal, stage B | wrist | wrist |
| knuckle | palm → finger | bare pin, no clevis | — | finger |
| hip | pelvis → thigh | mount-to-mount hinge | pelvis | thigh |
| knee | thigh → shin | hinge | thigh | shin |
| ankle | shin → foot | hinge | shin | foot |

Every mechanism above already exists as a block. Compose them. 

### The 11 parts — shape, then the joint halves it carries

- **head** — cylinder drum, axis +Z, face = the flat disc. Ball below.
- **torso** — slab chest: core box, half-cylinder flanks, front panel, waist box
  under it. Neck socket up, a cone seat on each flank, waist ball below.
- **pelvis** — half-cylinder shell, axis X, dome down; disc on top. Waist socket
  above, hip fixed halves on the dome's flat end faces. The rig root.
- **upperArm** — biceps cylinder. The whole shoulder above, elbow clevis + pin
  below.
- **forearm** — box, with a 4-plank shroud sleeving it down to the wrist. Elbow
  male tongue above, wrist stage-A clevis + pin below.
- **wrist** — the middle link. Stage-A male tongue above, the whole stage-B hinge
  below. Both stages share one base.
- **palm** — a block, bolted to stage B's male disc and twisting with it. Fingers
  hang off its side faces: one behind, two in front.
- **finger** — 3 box digits on bare pins, pins along X, curling toward each other.
- **thigh** — box. Hip male tongue above, knee clevis + pin below.
- **shin** — barrel. Knee male U above, ankle clevis + pin below.
- **foot** — ankle base box under the pin. Slope + toe box forward, heel + slope
  box back. One sole plane, toe to heel. Ankle male tongue on the base.

## Layer 3 — rig

**Declarative link list.** Each link names its part, its parent, parent slot ↔ own
slot, and which bone axis each pose channel drives. Pelvis is the root.

## Pose channels — 14, degrees

```
headYaw headPitch twist waistBend waistTilt
shoulder armOut elbow wristBend wristTilt wristTwist curl
hip knee
```

Each drives BOTH sides. `twist / waistBend / waistTilt` are the waist ball's 3 DOF.
The shoulder spends two: `armOut` is its pin swing, `shoulder` spins the whole
joint on the disc seated in the torso. `elbow / knee / hip` swing their pins.
`wristBend / wristTilt` are the universal joint's two stages. `wristTwist` turns
the palm on the disc it bolts to. `curl` curls all 6 fingers' inner digits.

## Deliver

`skeleton.js`, `parts.js`, `rig.js`, `main.js`, `index.html`.
`atlasModel(seed, pose)` → `{ items, meshes }`; items carry
`{ key, mesh, m, t, color }`. Demo draws `items`, idle-animated.

The rig owns the skeleton, so it also publishes each pose channel's **bone depth**
(root = 0). Nobody downstream hand-keeps a list of which joints are root-near.

A complete humanoid stands on the grid: head, torso, pelvis, 2 arms with 3-finger
grippers, 2 legs with feet. Right side mirrors left.
