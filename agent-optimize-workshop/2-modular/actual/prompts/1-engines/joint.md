# joint engine — mechanisms, and the seating rule

Scope: the mechanisms joining two parts, and the rule seating one on the other. Built
on the modeling engine's solids. Ratios and math — no tuning table anywhere.

## One input

A joint is handed exactly ONE thing: the **section of the child's plug** — the
cross-section of the face the child hangs by.

    R = inradius(section)    W = the section across the pin    K = half the section across the swing

No `size`, no `slim`, no per-joint dimension. A joint therefore cannot be fatter than
the limb it sits in, and its two halves cannot disagree. Both base plates ARE the
section, so a plate lands on its face exactly: never proud, never sunk.

## The ratio tables — the entire tuning surface

**hinge** (and each stage of a universal)

| piece | dimension |
|---|---|
| clevis arm (×2) | `0.22 W` thick |
| clearance, each side | `0.03 W` → tongue = `0.50 W`; the three stack to exactly W |
| tongue | the SAME solid as an arm, at tongue thickness |
| knuckle radius | `K` — inside the limb's silhouette |
| body (knuckle centre → plate face) | `0.50 K` |
| pin radius / protrusion | `0.30 min(K, W/2)` / `0.05 R` past each arm |
| base plate | `0.25 R` thick |

**ball**

| piece | dimension |
|---|---|
| ball | `0.70 R` |
| socket inner | `1.04 ×` ball — it NESTS; the surfaces are not coincident |
| socket wall | `0.28 ×` inner → outer `= 0.93 R`, inside the limb |
| shaft hole | `0.55 ×` ball — smaller, so the ball is captured |
| shaft | `0.35 ×` ball — smaller than the hole, so it exits |
| ball centre → plate face | `1.05 ×` ball — clears it |
| male plate over the socket rim | `0.25 R` |

Assert: `hole < ball < inner < outer ≤ R`; `shaft < hole`; `drop > ball`;
`tongue + 2·clearance + 2·arm = W`. These asserts replace every sentence a spec would
otherwise spend begging for a fit.

## Two shapes

- **D-plate** — knuckle at the origin, body reaching −Y, thickness along X: one
  extruded outline (half-circle + rectangle). The female arm and the male tongue are
  THE SAME SOLID at two thicknesses, so a clevis and its tongue cannot mismatch.
- **socket** — ONE closed lathe profile, traversed once: out along the skirt rim, up
  the outer dome, in across the top hole rim, back down the inner dome. Revolved, that
  IS a double-walled cup, both cut edges capped, every normal outward. Do not hand-roll
  a sphere band; do not make a full sphere.

Everything else (pin, ball, shaft, plates) is a cylinder, a sphere, or `plate(sec)`.

## The seating rule — the whole of it

Given the parent's ANCHOR face, the child's plug SECTION, and where the limb should AIM:

    centre = anchor.pos + anchor.n · seat
    the child's root face lands `reach` beyond the centre, down the child's own −Y
    the pin ⊥ both the anchor normal and the aim (straight through: the child's own X)

`seat` and `reach` are not numbers anyone types — they are read off the pieces just
built (`body + plate`, `top + plate`). So the gap between the parent's surface and the
child's is algebraically zero, and geometry cannot drift from kinematics: they are the
same expression. Never place a child origin on the anchor point — a joint occupies
real space.

**Frames.** Two, sharing the rotation centre: **F** (female) with +Y along the anchor
normal, its pieces hanging −Y onto the parent's face; **C** (child) with +Y = −aim, its
pieces hanging −Y toward the child. Build both around FORWARD, never around the pin: a
pin-derived frame twists the whole chain below a corner (an arm hung off a flank would
carry its elbow's axis round with it). Forward-built frames come out identical on both
flanks — which is why no geometry is ever mirrored. With no corner, F and C differ by a
half turn: "normals oppose" falls out instead of being a rule.

**`aim`** is `"along"` or `"against"` — the child's body follows the parent's body (−Y,
since every part hangs that way) or opposes it. A corner is expressed by aiming, never
by a re-seat rotation. A caller cannot get the sign of a word wrong.

## Mechanisms

- **hinge** — 1 pin. `collar: true` adds a spin about the anchor normal (a shoulder
  turning in a seat plate the parent holds).
- **ball** — a socket, 3 axes. No corner: its aim must follow the normal.
- **universal** — two hinges at right angles; the second's clevis hangs off the first's
  tongue plate and they SHARE it. Optional twist collar under it. One joint to the
  caller, three bones to the rig.

`build(kind, anchor, section, opts)` returns: the BONES (each with a name, a local
axis, a SIGN, and its static rest), the hardware ALREADY PLACED in the frame it belongs
to (female in the parent's space, male on its bone), and the child's offset. A rig then
computes no position and no rotation of its own.

The bone's SIGN is how one channel drives both flanks: a mirrored face gives a mirrored
pin, so the motion comes out symmetric with no sign table anywhere.

## Demo page

Wire into the shared engine demo page. Yours: a **joints** tab group — one tab per
mechanism. Sliders drive the moving half in degrees while the fixed half holds; a
slider for the PLUG's section shows all the hardware resizing with the limb. Overlay
the anchor face, the rotation centre, and the seat/reach spans.
