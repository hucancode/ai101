## Task

A rig with fourteen pose sliders sits dead until something drives them. Write a
**choreographer**: it plans a **beat** every `period` seconds and plays it by
mutating the pose object **in place**.

## The beat

A period splits into a leading **anticipation** slice, the **main** move, and a
rest tail holding the new pose. The main move spends its own closing fraction
bouncing.

Usually **improvised**, out of two groups:

- **anticipation** — 1–3 SMALL sliders (leaf-near: elbows, wrists, fingers).
  Linear ramps, fired first, so extremities lead the body.
- **main** — 1 BIG slider (root-near: waist, shoulder, hip), played **move-hit**:
  dead-linear travel aimed PAST the target, then an `outBounce` reeling it back
  down onto it exactly.
- Skip moving hip or knee.

Now and then a beat instead drops everything and snaps **every** slider home, so
improvised beats never wander further from the rest pose.

A keyframe is a **partial** pose — only the keys it names move. Shadow the pose
while planning, so a key written twice starts each leg where the last one ended.
Targets are captured at plan time: a beat starts wherever the last one — or the
user's dragging — left off.

## Target selection

Aim into the half of the range **furthest** from where the slider sits, so every
beat is a real move, not a twitch in place. Draw from the 45° / 90° / 180° grid
inside that half — machine-square poses. Where it sits now is never a candidate.
A half too narrow for another grid angle falls back to a raw draw.

## Contract

```js
createChoreographer(sliders, { home, seed, ...timing }) -> { step(dt, pose) }

sliders  [{ key, min, max, big }]   // big = root-near bone
home     partial pose the snap-home beat returns to
timing   overrides any beat-shape default (period, slice ratios, bounce)
```

Every beat-shape number is a named, overridable default. Seeded RNG: same seed,
same performance. The caller owns the pose object and the slider ranges; the
choreographer names no channel of any particular rig.

## Deliver

`choreo.js`, `main.js`, `index.html`. Demo: one range input per pose channel,
two-way bound to the pose object; that same object fed to `atlasModel(seed, pose)`
every frame; `big` read off the rig's published channel depth, not a hand-kept
list. Clamp the frame `dt` — a backgrounded tab must not skip a whole beat. A
drag hands control straight back to the hand.
