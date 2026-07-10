# Prompt 06 — procedural choreography

## Task

A rig with fourteen pose sliders sits dead until something drives them. Write a
**choreographer**: it plans a **beat** every `period` seconds and plays it by
mutating the pose object **in place**.

## The beat

Usually **improvised**, out of two groups of sliders:

- **anticipation** — 1–3 SMALL sliders (leaf-near bones: elbows, wrists, fingers).
  Plain linear ramps, fired first, so the extremities lead the body.
- **main** — 1 BIG slider (root-near bone: waist, shoulder, hip), played
  **move-hit**: a dead-linear travel aimed PAST the target, then an `outBounce`
  reeling it back down onto it exactly.

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

## Deliver

`choreo.js`, `main.js`, `index.html`. Demo: one range input per pose channel,
two-way bound to the pose object; one button per montage; the same pose object fed
to `atlasModel(seed, pose)` every frame. Clamp the frame `dt` — a backgrounded tab
must not skip a whole beat.
