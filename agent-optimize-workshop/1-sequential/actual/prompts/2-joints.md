## Task

Robots are chains of joints. Model each 3 joints - hinge1 (1DOF) hinge2 ball1(3DOF) for future reuse.
A fourth, the **mount-to-mount hinge**, is exported for consumers to build with
but is not a catalog entry and not in the gallery.

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

**hinge2** — one hinge stage, then a second **directly below it**, pin turned from
X to Z. The two pins are offset along Y: they never meet. Not a Cardan cross, not
one hub. The upper stage's male half carries no base; the lower stage's female
base is the single plate between them. Pose: `rx`, `rz`.

**ball** — ball center = origin. The socket is a shell whose dome reaches **past
the ball's equator**, so it cups the ball rather than resting under it: only the
top cap shows, through the opening, and nothing bulges out the bottom. Thin base
below. Male is sphere, shaft up through the opening, plate on top.
Pose: `rx / ry / rz`.

**mount-to-mount hinge** — the hinge a limb chains through: solid male, disc
bases, rest-swung 90° into an **L**, so its two mounts face different ways — one
into the parent's flank, one out into the child. A limb hung off it stands clear
of the body. Pose: `swing`, plus a spin at each mount.

## Channel routing

| mechanism | axis | carries |
|---|---|---|
| hinge1 | `swing` | the whole male half |
| hinge2 | `rx` | upper-stage male — **and all of the lower stage rides it** |
| hinge2 | `rz` | lower-stage male only |
| ball1 | `rx/ry/rz` | the whole male half, about the ball center |
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

Only the joints consumers chain through publish slots, one per half: the ball, and
the mount-to-mount hinge (there the tangent is the pin axis).

## Derived dimensions

Every derived measurement of a kind (gap widths with clearance, knuckle radii,
bridge offsets, pin half-length, socket drop) is computed in ONE place, read by
both the geometry and the slots, so a slot can never drift from what it seats on.

## Deliver

`joints.js`, `slots.js`, `main.js`, `index.html`.
A catalog entry previews to `{ items, meshes }` — baked handles plus `color`.

Animated gallery: all 3 entries side by side, every pose axis visibly
articulating. Turn on disc bases where a joint has them, so the spins read.
