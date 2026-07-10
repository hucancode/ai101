# Prompt 05 — assembly animation

## Task

The robot builds itself, driven by one progress scalar.

`assembleModel(items, u)` — at build progress `u ∈ [0,1]` return a **new** item
list: items not yet spawned dropped, moving items with displaced `m` / `t` and an
alpha `a`. `u ≤ 0` → nothing. `u ≥ 1` → the exact input model.

The build is **hierarchical**. Four phases per sub-assembly group — a part body or
a joint block, i.e. an item's `group` tag:

1. **Fly-in** — each primitive flies from a hashed scatter point to a small
   standoff near its seat in the group. Self-spinning, unwinding to exactly 0 as
   the flight ends. Fading in. The group itself is parked FAR out along its
   assembly normal `an`.
2. **Snap** — the primitive snaps into its seat with an `outBack` overshoot. The
   group is now formed.
3. **Homing flight** (`homing.js`) — the formed group launches with a hashed
   lateral kick and chases a gate hovering `dock` off the mount point, like a
   missile: fixed-step, turn-rate-clamped seek, arrival damping, speed ramp. Over
   the last `capture` fraction a smoothstep blend settles it exactly onto the
   gate, heading exactly on `−n`. The group **banks** rigidly along its velocity —
   the minimal rotation taking the plug axis onto the flight direction — and
   levels out on arrival.
4. **Snap-in** — a straight plug-in run down the mount normal, gate → seat,
   `inOutCubic` depth, orientation locked.

## Hard requirements

- **Deterministic and scrub-safe.** All randomness hashed off item / group indices
  (`hash01`). Flights re-simulated from launch with fixed steps on every call. No
  state kept between calls. Same `u` → identical frame, always.
- **Chain-ordered stagger.** Group start time comes from skeleton chain `depth`,
  root first. Primitives stagger within their group. Normalize the clock by the
  authored relative durations, so the deepest group seats exactly at `u = 1`.
- **Shear-free rotation.** The settle from parked orientation to seat orientation
  slerps the **pure rotation delta** on the quaternion sphere. A component-wise
  matrix lerp would shear the scaled instances.
- **One config object.** `ASSEMBLY` holds every tunable: phase durations (relative),
  distance ranges (rig units), easing fractions, integration step count.

## Scope

In scope: `assembly.js` — `ASSEMBLY`, group bookkeeping, `assembleModel`. And
`homing.js` — `hash01`, `homingParams`, `simulateHoming`, `approachBlend`,
`snapIn`.

`assembleModel(items, u, refFn)` takes an optional `refFn` that samples a MOVING
body over build progress, so a group can home onto a mount point that is itself in
motion. Build it; this demo exercises it with a static body.

Out of scope: everything already built. Choreography.

## Data contract

In: the rig's items — `{ key, mesh, m, t, color, group, an, depth }`.
Out: same shape, plus `a` (alpha; the harness fades on it).

## Deliver

`assembly.js`, `homing.js`, `main.js`, `index.html`. Demo: a scrub slider plus an
auto-play loop.

`u=0` empty. `u=1` bit-identical to the input model. Monotone in between — no group
seats before its parent. Scrub back and forth: exact replay, no state leak. Phases
read on screen: scatter fly-in with fade and spin, visible overshoot snap, a fast
banked homing arc per group, clean plug-in along the mount normal. No shear at any
point — limbs stay rigid mid-settle.
