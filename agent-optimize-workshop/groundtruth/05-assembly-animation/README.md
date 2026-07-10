# 05 — Animate Robot Assembly Using Phase and Curve

Builds on 04 (the atlas robot). New layer: the robot builds itself, driven by
one progress scalar.

## Problem statement

Animate `assembleModel(items, u)`: at build progress `u ∈ [0,1]` return a NEW
item list — items not yet spawned dropped, moving items with displaced `m`/`t`
and alpha `a`. `u ≤ 0` → nothing, `u ≥ 1` → the exact input model. The build is
**hierarchical** and runs in FOUR phases per sub-assembly group (a part body
or a joint block — the `group` tag from problem 04):

1. **Fly-in** — each primitive flies from a hashed scatter point to a small
   standoff near its seat in the group, self-spinning (unwinding to exactly 0
   as the flight ends), fading in. The group is parked FAR out along its
   assembly normal `an`.
2. **Snap** — the primitive snaps into its seat with an `outBack` overshoot.
   The group is now formed.
3. **Homing flight** (`homing.js`) — the formed group launches (hashed lateral
   kick) and chases a gate hovering `dock` off the mount point, like a missile:
   fixed-step, turn-rate-clamped seek with arrival damping and a speed ramp.
   Over the last `capture` fraction, a smoothstep blend settles it exactly onto
   the gate, heading exactly on −n. The group **banks** rigidly along its
   velocity (minimal rotation taking the plug axis onto the flight direction),
   leveling out on arrival.
4. **Snap-in** — a straight plug-in run down the mount normal, gate → seat,
   `inOutCubic` depth, orientation locked.

Hard requirements:

- **Deterministic & scrub-safe**: all randomness hashed off item/group indices
  (`hash01`); flights re-simulated from launch with fixed steps every call.
  Same `u` → identical frame, always.
- **Chain-ordered stagger**: group start time from skeleton chain `depth` (root
  first); primitives stagger within their group; the clock is normalized by the
  authored relative durations so the deepest group seats exactly at `u = 1`.
- **Shear-free rotation**: the settle from parked orientation to seat
  orientation slerps the pure rotation delta on the quaternion sphere
  (`qFromM3`/`qSlerp`/`qToM3`) — a component-wise matrix lerp would shear the
  scaled instances.
- All tunables in one `ASSEMBLY` config object (durations, ranges, easing
  fractions, step count) — phase times relative durations, distances rig units.

## Scope

In scope: `assembly.js` (`ASSEMBLY`, group bookkeeping, `assembleModel`) and
`homing.js` (`hash01`, `homingParams`, `simulateHoming`, `approachBlend`,
`snapIn`). The optional `refFn` machinery (sampling a MOVING body over build
progress, so the groups home on a mount point that is itself in motion) is
included in the ground truth but exercised with a static body here.

Out of scope: everything already built (01–04), choreography (06).

## Data contract

Input: problem 04's items (`{ key, mesh, m, t, color, group, an, depth }`).
Output: same-shape items + `a` (alpha, consumed by the harness for fade-in).
The demo page adds a scrub slider + auto-play loop.

## Run

```bash
python -m http.server 8000   # from workshop root
# open http://localhost:8000/05-assembly-animation/
```
