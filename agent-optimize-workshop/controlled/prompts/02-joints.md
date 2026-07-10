## Task

Robots are chains of joints. Model each 3 joints - hinge1 (1DOF) hinge2 ball1(3DOF) for future reuse.

## Articulation

A joint has two halves: **fixed** (female, parent side) and **moving** (male,
child side). A block emits each into its own channel, both authored around the
joint's local origin — the pin axis, or the ball center.

Modeling params shape geometry. Pose drives rotation.

## The mechanisms

**hinge1** — pin along X. A narrow U nested inside a wide one with clearance, arms
interleaved, one pin through all four knuckles. Female opens down, male opens up.
Bare shaft, never flush with an arm face. Options: solid tongue instead of the
male U; disc instead of either base; a half with no base, sharing its neighbour's.
Pose: `swing`.

**hinge2** — two hinge stages in series sharing ONE middle base, pins crossed X
then Z. Pose: `rx`, `rz`.

**ball** — ball center = origin. Socket cups the ball with clearance on a thin
base; male is sphere, shaft up through the socket opening, plate on top.
Pose: `rx / ry / rz`.

## Channel routing

| mechanism | axis | carries |
|---|---|---|
| hinge | `swing` | the whole male half |
| universal | `rx` | stage-A male — **and all of stage B rides it** |
| universal | `rz` | stage-B male only |
| ball | `rx/ry/rz` | the whole male half, about the ball center |
| mount-to-mount | `swing` | the male tongue only |
| mount-to-mount | mount-1 spin | the **whole joint** — the female is the parent, so it carries the male chain |
| mount-to-mount | mount-2 spin | the mount-2 turntable only |

## Slots — how two pieces seat against each other

A **slot** is a full frame: origin, outward normal, forward tangent perpendicular
to it. Seat a child slot on a parent slot and the origins coincide, the forwards
align, the normals **oppose** — the faces look at each other, so the pieces meet
instead of overlapping. That is a rest rotation, solved from the two frames.
Nothing is positioned by eye. Mirror a slot to get the other flank of a symmetric
rig.

Only the joints consumers chain through publish slots, one per half.

## Derived dimensions

Every derived measurement of a kind (gap widths with clearance, knuckle radii,
bridge offsets, pin half-length, socket drop) is computed in ONE place, read by
both the geometry and the slots, so a slot can never drift from what it seats on.

## Deliver

`joints.js`, `slots.js`, `main.js`, `index.html`.
A catalog entry previews to `{ items, meshes }` — baked handles plus `color`.

Animated gallery: all 3 entries side by side, every pose axis visibly
articulating. Turn on disc bases where a joint has them, so the spins read.
