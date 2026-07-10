# 06 — Choreograph the Rig with Procedural Beats

Builds on 04 (the atlas rig and its pose channels). New layer: the robot moves
on its own — a procedural beat generator writes the pose sliders.

## Problem statement

A rig with fourteen pose sliders sits dead until something drives them. Write a
**choreographer** that plans a **beat** every `period` seconds and plays it by
mutating the pose object **in place**, so whatever binds those sliders (the
demo's range inputs) tracks the motion for free, and a user drag hands control
straight back — targets are captured from the pose at plan time, so a beat
always starts wherever the last one, or the user's own dragging, left off.

### The beat

A beat is usually **improvised**, out of two groups of sliders:

- **anticipation** — 1–3 SMALL sliders (leaf-near bones: elbows, wrists,
  fingers). Plain linear ramps, fired first, so the extremities lead the body.
- **main** — 1 BIG slider (root-near bone: waist, shoulder, hip) played
  *move-hit*: a dead-linear travel aimed PAST the target, then an `outBounce`
  that reels it back down onto it exactly.

Sometimes the beat is **rehearsed** instead: with a small chance every slider
bounces home to the rest pose, or a **montage** runs — a setup pose struck with
the same bounce, then a sequence of keyframes played through. A montage owns the
clock for as long as it lasts; no beat interrupts it. `play(name)` queues one by
hand, cutting the current beat short.

Which sliders are "big" is not a hand-kept list: a pose channel drives the link
it sits on, so its depth IS that link's chain depth. The rig exports
`ATLAS_POSE_DEPTH`, and the demo calls everything at depth ≤ 2 big.

### Two details that make it read as machinery

- **Target selection** — aim into the half of the range furthest from where the
  slider sits (so every beat is a real move, not a twitch in place), and draw
  from the 45°/90°/180° grid inside that half, so the rig strikes
  machine-square poses. Where it sits now is never a candidate.
- **Joint budgets** — channels sharing one joint pick their targets
  independently, and three of them at full swing fold the part through itself.
  Each budget caps what its group may spend in total; over that, the whole group
  scales down together, so the pose keeps its shape and only its amplitude
  gives. Applied to the POSE, not the targets — a bounce overshoots past its
  target and would blow the budget on the way.

## Scope

In scope: `choreo.js` — `CHOREO_TIMING`, the `moveBounce` ease, grid target
selection, Fisher-Yates sampling, montage/home planning, and
`createChoreographer(sliders, { home, montages, budgets, seed, ...timing })`
returning `{ step(dt, pose), play(name) }`. Beats are drawn from the seeded
PRNG (`mulberry32`, in `math.js`), so a run is reproducible.

Out of scope: everything already built (01–05). The rig is untouched; the
choreographer only writes its pose object.

## Data contract

```js
createChoreographer(
  sliders,   // [{ key, min, max, big }] — `big` marks the root-near bones
  { home,       // rest pose the rig occasionally snaps back to
    montages,   // { name: { setup, sequence, stepRatio, loops } }
    budgets,    // [{ keys, limit }] — channels sharing a joint, total rotation allowed
    seed, ...CHOREO_TIMING overrides },
)
```

`step(dt, pose)` advances the clock and writes `pose` in place. The demo feeds
that same object to `atlasModel(seed, pose)` and to its slider panel.

## Run

```bash
python -m http.server 8000   # from workshop root
# open http://localhost:8000/06-choreo/
```
