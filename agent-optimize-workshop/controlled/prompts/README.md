# Prompts — six steps to the atlas

One prompt per build step. Each is fed to an agentic coding tool on its own.

**Each prompt starts from the previous step's ground truth.** Copy
`groundtruth/0(N-1)-*/` in, hand it to the agent as frozen, and let it add exactly
one layer. A failure then belongs to that layer, not to a compounding drift from
step 01.

| Prompt | Starts from | Adds |
|---|---|---|
| [01](01-primitive-render.md) | harness + math | `primitives.js` — raw triangle soup |
| [02](02-parameterized-primitives.md) | gt 01 | handles, mesh registry, transform algebra |
| [03](03-joints.md) | gt 02 | `joints.js`, `kit.js`, `color.js` |
| [04](04-robot.md) | gt 03 | `skeleton.js`, `parts.js`, `rig.js` |
| [05](05-assembly-animation.md) | gt 04 | `homing.js`, `assembly.js` |
| [06](06-choreo.md) | gt 04 (05 is orthogonal) | `choreo.js` |

Always frozen, never re-derived by the agent:

- `three.module.min.js` — Three.js r170, vendored, so the pages run offline.
- `render.js` — the Three.js harness. Camera, orbit, lights.
- `math.js` — a thin adapter over Three.js math for the plain-array item contract
  (`Matrix3`, `Matrix4`, `Quaternion`, `MathUtils`), plus the three things
  Three.js does not ship: easing curves, a seeded PRNG, `TAU`.

Every prompt says outright that Three.js owns camera and math, because an agent
left to itself will rewrite both.

[`naive.md`](naive.md) is the control: the same end result asked for in one shot,
no decomposition.

## Style rules for editing these

- State **scope**, never implementation. What the mechanism IS, what a channel
  carries, what a contract promises. Not how to compute it.
- Terse. Caveman. Fragments fine.
- Joints (03) and parts (04) are where agents produce unreliable geometry. Be
  exact there — names, params, pose keys, which half lives in which part, what a
  rotation carries downstream.
- No tests. Verification is visual.
- No instructions for running a static server.
