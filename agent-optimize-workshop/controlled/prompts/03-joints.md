# Prompt 03 — joints from primitives

## Task

Robots are chains of joints. Model each joint **kind** once, as a block standing
equal to a primitive, so parts compose blocks instead of hand-rolling arms and
pins. One mechanism fix upgrades every consumer.

## Mechanics vocabulary

- **pin** — the shaft two halves rotate about. Its axis is the swing axis.
- **knuckle** — the rounded end of an arm the pin passes through.
- **U piece** — two arms + a **bridge** joining them opposite the opening. A
  **base** plate closes the bridge.
- **tongue** — I-shaped solid male: one full-width plate instead of two arms.
- **clevis** — the female fork the tongue swings inside.
- **barrel / flange / neck / cap** — cylinder-stack anatomy: fat body, collar
  ring, thin waist, end disc.

## Articulation model

A joint block emits primitive handles into channels:

```js
someBlock(fixed, moving, params, pose)   // fixed, moving: (handle) => void
```

`fixed` takes the female/parent half, `moving` the male/child half. Both authored
around the joint's **local origin** (pin axis, or ball center).

Runtime `pose` articulates by **wrapping channels** — route male handles through a
rotation before they reach `moving`. Articulation = channel routing + the existing
transform algebra. No new geometry machinery. A piece that rotates while the rest
of its half stays put gets its own wrapped sub-channel.

Modeling params shape geometry. Pose drives runtime rotation. Two separate sets.
Never mix them.

## Joint catalog

**`hingeBlock`** — pin = X through the origin. Two **rounded-U** pieces: a narrow
U nested inside a wide one with clearance, arms interleaved, knuckles rounded, one
shared **pin** through all four knuckles. Female U opens down, male U opens up.
The pin is a bare shaft, no end caps. It pokes `pinOut` past the female arms'
outer faces; even at `pinOut = 0` it stays a hair proud, so its cap never lands
coplanar with the arm face.
Flags: `solid` swaps the male U for a tongue. `discF` / `discM` swap either base
box for a disc (a cylinder circumscribing the box footprint, so arm plates never
poke past the rim). `baseH` sizes both bases. `noBase` emits a half's arms alone,
for a half that shares its neighbour's base.
Params: `gap, armT, armH, depth, pinR, clr, pinOut, baseH`.
Pose: `swing` about the pin.
`sides.female` / `sides.male` override dims for one half only.

**`hinge2Block`** — literally TWO hinge stages **in series**, sharing ONE middle
base. Pins X then Z: a 2-axis universal joint (the atlas wrist). Stage A's male
emits no base; stage B's female base IS the single middle plate. Disc flags run
top to bottom: `discF`, `discMid`, `discM`.
Pose: `rx`, `rz`.

**`ballBlock`** — ball-and-socket, ball center = origin. Female: a **cut-hemisphere
socket** cupping the ball with clearance, standing on a thin base. Male: the
sphere, a shaft growing up out of the socket opening, a plate on top.
Params: `ballR, socketT, cut, shaftR, shaftLen, baseW, baseT`. `disc` (or
`base: "disc"`) makes both base plates cylinders instead of boxes.
Pose: `rx / ry / rz` about the ball center.

**`pivotBlock`** — symmetric double pivot, spin axis = Y. Center **barrel**; on
each end a **flange → neck → cap** stack.
Params: `barrelR, barrelLen, flangeR, neckR, neckLen, capR`.
Pose: `spinA` (top stack), `spinB` (bottom stack). Barrel never moves.
Single sink: `pivotBlock(add, params, pose)`.

**`prismaticBlock`** — the one **LINEAR** joint. Three boxes: a cover sleeve
centered on the origin, slide axis = Y, and a square mounting shaft running out of
each end. At slide 0 a shaft's inner end rests on the cover's mid-plane, so the
two never collide. Travel is capped by an engagement reserve, so a shaft can never
leave the cover.
Params: `coverW, coverLen, coverD, shaftW, shaftLen`.
Pose: `slideA`, `slideB` — **model units, not degrees**.
`fixed` = cover + shaft A. `moving` = shaft B.

**`hinge1Block`** — the generic mount-to-mount hinge parts chain through. Same
`hingeBlock`, solid male, disc bases on both halves, re-oriented and **rest-swung
90° into an L**. Mount 1 (female disc) faces **+X** into the parent flank. Pin
runs along **Y**. Mount 2 (male disc) exits **+Z** into the child.
Pose: `swing`, `spinF`, `spinM`.

## Channel routing

"Carries" = the rotation composes onto everything downstream in that channel.

| block | axis | carries |
|---|---|---|
| `hingeBlock` | `swing` | the whole male half |
| `hinge2Block` | `rx` | stage-A male — **and all of stage B rides it** |
| `hinge2Block` | `rz` | stage-B male only |
| `ballBlock` | `rx/ry/rz` | the whole male half, one rotation about the ball center |
| `pivotBlock` | `spinA` / `spinB` | its own end stack only |
| `prismaticBlock` | `slideA` / `slideB` | its own shaft only |
| `hinge1Block` | `swing` | the male tongue (about the pin, Y) |
| `hinge1Block` | `spinF` | the **whole joint** about the mount-1 disc axis (X) — the female is the parent, so it carries the male chain |
| `hinge1Block` | `spinM` | the mount-2 turntable (Z) only |

Bodies of revolution: a `spinF`/`spinM`/`spinA`/`spinB` shows nothing on its own
disc. It only reads once a consumer hangs a limb off that mount.

## Supporting systems

1. **Derived dims** — ONE `*Dims(params)` per joint kind computes every derived
   measurement (gap widths including clearance, knuckle radii, bridge offsets, pin
   half-length, socket drop). Both the block builder and the mount function
   consume it, so a mount can never drift from the geometry it seats on.
2. **Mount slots** — `jointMounts(kind, p)` → slots `a` (fixed half) and `b`
   (moving half), each `{ pos, n, f }`: origin + outward normal + forward tangent,
   `f ⊥ n`. A full coordinate frame in joint-local space. Consumers seat geometry
   on slots instead of re-deriving offsets. Only the joints consumers chain
   through declare mounts: **`ball`** (socket base underside / male plate top) and
   **`hinge1`** (mount-1 disc face / mount-2 disc face, `f` = the pin axis on
   both).
3. **Group tagging** — `jbegin()` / `jend()` bracket each block's emissions; nested
   blocks stack (`hinge2Block` and `hinge1Block` call `hingeBlock`).
   `currentJointGroup()` reports the owning joint, so a later consumer can group
   primitives by mechanism. Primitives emitted outside any block belong to the
   part body (null).
4. **Identity coloring** (`color.js`) — `colorOf(id, seed)` hashes a shape id into
   a curated palette. Identical primitives share a color, lego-style. A new seed
   reshuffles, keeps the property. `colorMemo(seed)` = the per-frame cached form.
5. **Kit registry** (`kit.js`) — `createKit({ params, builders, slots })` turns a
   catalog into `partModel(name, seed, params, pose)` (standalone preview),
   `buildPart(name, add, params, pose)` (raw build into a caller's sink), and
   `partSlots(name, params)`. Kits are **scoped**: a name need only be unique
   inside its own kit. The joint catalog is a kit like any other — it declares no
   slots, because a joint's mounts come from `jointMounts`.

## Catalog plumbing

Default modeling params per kind. `degPose` converts UI degrees → block radians;
`prismatic1` skips it, its DOFs are linear. `collect()` runs a builder and bakes
handles into colored items. `JOINT_KIT` exposes the five catalog entries:

```
hinge1  hinge2  pivot1  prismatic1  ball1
```

(Catalog `hinge1` is `hingeBlock` with the disc flags exposed — not
`hinge1Block`.)

## Deliver

`joints.js`, `color.js`, `kit.js`, `main.js`, `index.html`.
`JOINT_KIT.partModel(...)` → `{ items, meshes }`; items are baked handles plus
`color`. Demo draws `items`.

Animated gallery: all 5 joints side by side, every pose axis visibly articulating.
Turn disc bases on, so the turntable spins read on the bodies of revolution.

Nested arms never interpenetrate. Pins pass through knuckles. Socket cups ball.
Prismatic shafts slide out and stop before leaving the cover. Male and female stay
meshed under articulation.
