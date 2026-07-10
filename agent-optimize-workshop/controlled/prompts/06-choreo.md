# Prompt 06 — procedural choreography

## Task

A rig with fourteen pose sliders sits dead until something drives them. Write a
**choreographer**: it plans a **beat** every `period` seconds and plays it by
mutating the pose object **in place**.

In place matters. Whatever binds those sliders — the demo's range inputs — tracks
the motion for free, and a user drag hands control straight back. Targets are
captured from the pose at plan time, so a beat always starts wherever the last
one, or the user's own dragging, left off.

## The beat

Usually **improvised**, out of two groups of sliders:

- **anticipation** — 1–3 SMALL sliders (leaf-near bones: elbows, wrists, fingers).
  Plain linear ramps, fired first, so the extremities lead the body.
- **main** — 1 BIG slider (root-near bone: waist, shoulder, hip), played
  **move-hit**: a dead-linear travel aimed PAST the target, then an `outBounce`
  reeling it back down onto it exactly.

Sometimes **rehearsed** instead. Small chance every beat: either every slider
bounces home to the rest pose, or a **montage** runs — a setup pose struck with
the same bounce, then a sequence of keyframes walked through. A montage owns the
clock as long as it lasts; no beat interrupts it. `play(name)` queues one by hand,
cutting the current beat short.

Which sliders are "big" is not a hand-kept list. A pose channel drives the link it
sits on, so its depth IS that link's chain depth. Read `ATLAS_POSE_DEPTH`; call
everything at depth ≤ 2 big.

A keyframe is a **partial** pose — only the keys it names move. Shadow the pose as
the plan is laid out, so a key written twice (a wave passing back through the same
joint) starts each leg where the last one left it.

## Two details that make it read as machinery

- **Target selection** — aim into the half of the range **furthest** from where the
  slider sits, so every beat is a real move, not a twitch in place. Draw from the
  45° / 90° / 180° grid inside that half, so the rig strikes machine-square poses.
  Where it sits now is never a candidate. A half too narrow to hold another grid
  angle falls back to a raw draw.
- **Joint budgets** — channels sharing one joint pick their targets independently,
  and three of them at full swing fold the part through itself. Each budget caps
  what its group may spend in total; over that, the whole group scales down
  together, so the pose keeps its shape and only its amplitude gives. Apply to the
  **pose**, not the targets — a bounce overshoots past its target and would blow
  the budget on the way.

No clamp on a track as it plays. Targets already sit inside the slider range, and a
target sitting ON a range edge (arm fully raised, fist fully closed) would have its
overshoot flattened. The bounce has to swing past every time, not only where there
happens to be headroom.

## Scope

In scope: `choreo.js` — `CHOREO_TIMING` (one config object: period, and the beat's
anticipation / rest / bounce fractions), the `moveBounce` ease, grid target
selection, Fisher-Yates sampling, montage and home planning, and:

```js
createChoreographer(
  sliders,   // [{ key, min, max, big }] — `big` marks the root-near bones
  { home,       // rest pose the rig occasionally snaps back to
    montages,   // { name: { setup, sequence, stepRatio, loops } }
    budgets,    // [{ keys, limit }] — channels sharing a joint, total rotation allowed
    seed, ...CHOREO_TIMING overrides },
) // -> { step(dt, pose), play(name) }
```

`step(dt, pose)` advances the clock and writes `pose` in place.

Out of scope: everything already built. The rig is untouched — the choreographer
only writes its pose object.

## Deliver

`choreo.js`, `main.js`, `index.html`. Demo: one range input per pose channel,
two-way bound to the pose object; one button per montage; the same pose object fed
to `atlasModel(seed, pose)` every frame. Clamp the frame `dt` — a backgrounded tab
must not skip a whole beat.

The robot moves continuously, never freezes. Extremities lead: an anticipation ramp
starts before the main move. The main move visibly overshoots and bounces back onto
its target. Sliders track the motion; dragging one takes over that channel, and the
next beat plans from the dragged value. Montage buttons run their routine to
completion with no beat cutting in. Budgeted joints never fold through themselves.
Same seed → same sequence of beats.
