# 03 — Describe & Model Joints Using Primitives

Builds on 02 (primitive builder API). New layer: articulated joint mechanisms
as reusable building blocks, plus the two systems every later stage leans on —
the shared **kit** registry and identity **coloring**.

## Problem statement

Robots are chains of joints. Model each joint **kind** once, as a block with
the same standing as a primitive, so parts compose blocks instead of
hand-rolling arms and pins — a mechanism improvement upgrades every consumer.

A joint block has two emission channels: `fixed(handle)` for the female/parent
half and `moving(handle)` for the male/child half, both authored around the
joint's local origin. A runtime **pose** articulates by **wrapping channels**
(route the male handles through a swing rotation before they reach `moving`) —
articulation is channel routing plus the transform algebra from 02, no new
geometry machinery.

### Joint catalog — what each mechanism IS

- **hinge1** — two **rounded-U** pieces, a narrow U nested inside a wide one
  with clearance, arms interleaved, rounded knuckles, one shared **pin**
  through all four knuckles (pin = X). `solid` swaps the male U for an
  I-shaped **tongue**; `discF`/`discM` swap either base box for a disc, and
  `baseH` sizes both. Pose: `swing` about the pin.
- **hinge2** — TWO hinge1 stages **in series** sharing ONE middle base, pins X
  then Z: a 2-axis universal joint (the atlas wrist). Stage A's male emits no
  base; stage B's female base is the single middle plate. Pose: `rx` (stage A —
  the whole of stage B rides it), `rz` (stage-B male only).
- **ball1** — ball-and-socket, ball center = origin. Female: a
  **cut-hemisphere socket** cupping the ball with clearance, on a thin base.
  Male: the sphere, a shaft growing up out of the socket opening, a plate on
  top. Pose: `rx/ry/rz` about the ball center.
- **pivot1** — symmetric double pivot on the Y axis: center **barrel**, and on
  both ends a **flange → neck → cap** stack. Pose: `spinA` (top stack),
  `spinB` (bottom stack) — the barrel stays put.
- **prismatic1** — the one **LINEAR** joint: a cover sleeve with a square
  mounting shaft sliding out of each end. Pose = travel **distance** in model
  units (not degrees), capped by an engagement reserve so a shaft can never
  leave the cover.

`hinge1Block` is the generic mount-to-mount hinge the parts chain through: the
same `hingeBlock` re-oriented and rest-swung 90° into an L, with disc bases on
both halves. Mount 1 (female disc) faces +X into the parent flank, the pin runs
along Y, mount 2 (male disc) exits +Z into the child. Pose: `swing` about the
pin, `spinF` (spins the whole joint about the mount-1 disc axis — the female is
the parent, so it carries the male chain), `spinM` (the mount-2 turntable).

### Supporting systems — as important as the geometry

1. **Derived dims** — one `*Dims(params)` function per joint kind computes
   every derived measurement (gap widths incl. clearance, knuckle radii, bridge
   offsets, pin half-length). Both the block builder and the mount function
   consume it, so mounts can never drift from geometry.
2. **Mount slots** — `jointMounts(kind, p)` returns slots `a` (fixed half) and
   `b` (moving half), each `{ pos, n, f }`: origin + outward normal + forward
   tangent = a full coordinate frame in joint-local space. Only the joints
   consumers chain through declare mounts: `ball` and `hinge1`.
3. **Group tagging** — `jbegin()`/`jend()` bracket each block's emissions
   (nested blocks stack); `currentJointGroup()` reports the owning joint so a
   later consumer (the assembly animation, problem 05) can group primitives by
   mechanism.
4. **Identity coloring** (`color.js`) — `colorOf(id, seed)` hashes the shape id
   into a curated `PALETTE`: identical primitives share a color, lego-style; a
   new seed reshuffles but keeps the identity property. `colorMemo(seed)` is
   the per-frame cached form the rigs use.
5. **The kit registry** (`kit.js`) — `createKit({ params, builders, slots })`
   turns a catalog of builders into the three calls every consumer needs:
   `partModel(name, seed, params, pose)` (standalone preview),
   `buildPart(name, add, params, pose)` (raw build into a caller's sink), and
   `partSlots(name, params)`. Kits are **scoped**, so a part name only has to be
   unique inside its own kit. The joint catalog is a kit like any other; it
   just declares no slots, because a joint's mounts come from `jointMounts`.

## Scope

In scope: the blocks above, the dims/mounts/tagging systems, `degPose` (UI
degrees → radians; prismatic1 skips it, its DOFs are linear), `collect()` (run
a builder, bake handles into colored items), `createKit`, `colorOf`/`colorMemo`,
and `JOINT_KIT`.

Out of scope: parts and rigs (04), assembly animation (05), choreography (06).

## Data contract

`JOINT_KIT.partModel(...)` returns `{ items, meshes }` — items are baked
handles plus `color`, `meshes` maps each `key` to its unit mesh. The demo draws
`items` directly (the Three.js harness reads `item.mesh`).

## Acceptance criteria

- All 5 joints render side by side, mechanically plausible (nested arms don't
  interpenetrate, pins pass through knuckles, sockets cup balls).
- Each pose axis visibly articulates: swings rotate about the pin, the ball
  joint tumbles about the ball center, the prismatic shafts slide out and stop
  before leaving the cover.
- Male/female halves stay meshed under articulation — channel routing correct:
  hinge2's `rx` carries the whole of stage B, `rz` only the stage-B male; the
  pivot barrel never moves.

## Run

```bash
python -m http.server 8000   # from workshop root
# open http://localhost:8000/03-joints/
```
