# Ground truth — the atlas build, one self-contained program per step

Six steps, each a **standalone browser program**: its own copy of every file it
needs (no imports outside its directory, no build step, no package manager), an
`index.html` you open and watch, and a `README.md` stating the problem, the
scope, the data contract, and what "correct" looks like on screen.

Each step carries the previous step's files forward verbatim and adds one layer.
Verification is visual: open the page, read the acceptance criteria, look.

| Step | Adds | What you should see |
|------|------|---------------------|
| [01](01-primitive-render/) | `primitives.js` (raw triangle soup) | a row of lit primitives: box, sloped box, curved-slope box, cylinder, cone, truncated cone, sphere, hemisphere |
| [02](02-parameterized-primitives/) | `primitives.js` as a **builder** (handles + unit-mesh registry) | a parameter inspector: pick a builder, drag its sliders, watch the shape `id` change with size but not with rotation |
| [03](03-joints/) | `joints.js`, `kit.js`, `color.js` | the joint catalog articulating side by side: hinge1, hinge2, pivot1, prismatic1, ball1 |
| [04](04-robot/) | `skeleton.js`, `parts.js`, `rig.js` | a standing humanoid, idling; every mechanism stays meshed |
| [05](05-assembly-animation/) | `homing.js`, `assembly.js` | the robot builds itself: scatter → snap → banked homing flight → plug-in. Scrub the slider; the same `u` always shows the same frame |
| [06](06-choreo/) | `choreo.js` | the robot moves on its own: leaf joints anticipate, one root joint overshoots and bounces onto a machine-square pose; the sliders track it |

## Run

Any static server, from **this** directory:

```bash
python -m http.server 8000
# then open http://localhost:8000/01-primitive-render/ (…/06-choreo/)
```

## Layering

The whole point of the decomposition is that each layer only knows the one
below it:

```
primitives  →  joints  →  parts  →  rig  →  assembly / choreography
```

Primitives build joints; joints and primitives build parts; parts model the
robot; the rig only instantiates parts and drives them, never re-modeling
geometry; assembly and choreography only read the rig's output — the item list
and the pose object respectively.

`render.js` is workshop-only (a Three.js harness), and each step's `main.js` +
`index.html` are written for that step's demo.
