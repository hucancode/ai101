# joint engine — mechanisms + mating

Scope: two joint mechanisms and the mating that seats one part on another.
Generate NO geometry. Caller supplies the piece meshes. This engine owns their
DIMENSIONS and ROTATING ORIGIN — where each piece sits, how it turns. Math only.

## Two mechanisms

- **hinge** — 1 pin, 1 rotation axis. Pin axis through the origin.
- **ball** — a socket, 3 rotation axes. Ball center at the origin.

## Four pieces (caller supplies mesh, engine defines shape + size)

Each piece has a fixed shape the caller must honor; the engine passes the dims and
seats it:

| piece | shape | used by |
|---|---|---|
| arm / tongue | a D-plate — rounded knuckle + flat body (arch-box) | hinge: female = two arms, male = one wider tongue |
| pin | a rod (cylinder) on the hinge axis | hinge |
| socket | a cut-dome CAP (upper-dome shell, top pole sliced for a shaft hole) — NOT a bare sphere, NOT a full sphere | ball female |
| ball + shaft | a sphere on a rod | ball male |

Base plates (a box or a disc) are generic, not joint-shaped — caller supplies them
too; the engine places them under either half.

**Ball sizing (the two halves must match).** The socket and the ball are built from
ONE radius. The socket's INNER radius is the ball radius plus a SMALL clearance — the
ball NESTS inside the dome, the two surfaces must NOT be coincident (equal radii
z-fight and read as broken). The socket wall sits OUTSIDE the inner radius. The socket
is a cut-DOME CAP: the UPPER half of a sphere over the ball, with the top pole sliced
into a small HOLE at +Y. The hole is SMALLER than the ball (so the ball is captured)
but bigger than the shaft (so the shaft exits). The dome's wide skirt at the equator
is where the ball enters; the ball's top cap + shaft poke out the top hole. Both cut
edges (the equator skirt rim and the top hole rim) are closed by visible rings, wound
outward — never a hollow open edge. A ball that rattles in an over-wide socket, a
socket smaller than its ball, a ball flush with the wall, a full/near-full sphere, or
a hollow cut edge, is all wrong.

## Frames + rest orientation (get this right — inversions are the classic bug)

Convention: a half's BODY/base reaches −Y toward the part it belongs to; its mount
face looks along that reach. The joint origin is the rotation center (pin axis / ball
center) at [0,0,0].

Canonical piece frame the maker returns (engine re-orients from here):
- **arm / tongue** — rounded knuckle centered at the ORIGIN, flat body reaching −Y,
  thickness along Z; the pin-hole axis runs along X through the knuckle.
- **pin** — rod centered at the origin along the pin axis (X).
- **socket** — a cut-DOME CAP whose inner radius ≈ the ball radius, centered so the
  ball center is the ORIGIN; the dome covers the ball's +Y (upper) half, its skirt rim
  at the equator, and the top pole sliced into a small HOLE at +Y that the shaft exits
  (dome over the top, hole up — NOT wrapping the −Y half, NOT a full sphere).
- **ball + shaft** — sphere (radius = the socket's inner radius) centered at the ORIGIN,
  shaft reaching +Y out through the socket mouth toward the child.

Assembled rest (angle 0): female (fixed) half's base sits on the −Y side; male
(moving) half reaches +Y, i.e. OPPOSITE the female, so a plain joint chains straight
through the origin. Male tongue is NOT upside down; socket is NOT inverted. Female
mount normal points −Y, male mount normal +Y; `mate` opposes them so a child's male
mount seats flush on the parent's female slot. The L-seated hinge re-seats the male
90° so parent and child chain around a corner.

## Contract

- A factory binds the caller's piece makers, then returns the joint builders.
  A maker takes the dims the engine hands it and returns one mesh.
- Per mechanism, a builder emits the two compatible HALVES — female (fixed) and
  male (moving) — plus a base. Every dimension is a pure function of `(size, slim)`.
  Tuned small + slim so it reads as HARDWARE, not a limb. Keep the REACH compact:
  a short hinge arm/tongue body and a short ball shaft — the joint is a knuckle a
  limb chains through, it must NOT take up limb-length space (reach on the order of
  the knuckle/ball radius, not multiples of it).
- **Mount offsets** — expose named distances (`hingeMounts` / `ballMounts`: reach,
  disc radius, bridge, clearance, stack height / top, seat) so a caller lays parts
  around a joint WITHOUT touching raw dims.
- **Mating** — a slot is a frame `{ pos, normal, forward }`. `mate(parent, child)`
  SOLVES the rest rotation that seats the child slot on the parent's: origins
  coincide, forwards align, normals OPPOSE. Link tables stay pure data.
- **Composed joint** — build a named joint's two halves + bases under a static
  pose: `ball` = 3-DOF (rx/ry/rz); `hinge` = L-seated (faces angled 90° so a limb
  chains through the corner). Plus split helpers: a male ball alone, a female
  socket seated at a point, a plain hinge split across parent (female clevis + pin)
  and child (male tongue).

## Demo page

When your engine is done, wire it into the shared engine demo page (create it if it
does not exist yet). The page: an orbit viewer, a tab bar grouped by subject kind,
a slider panel that rebuilds per subject.

Your part: a **joints** tab group — one tab per mechanism; its sliders drive the
moving half in degrees while the fixed half holds; overlay each joint's mount frames
with the male and female mounts marked apart. Supply the demo's own piece meshes in
the canonical frames above. Build the socket as a real cut-DOME CAP — take the UPPER
half of a sphere over the ball and slice the top pole into a small hole. Double-walled
(outer + inner surface, inner normals facing the cavity), with BOTH cut edges closed
by rings: the equator skirt (−Y) and the top shaft hole (+Y). The top hole is smaller
than the ball (captures it) but clears the shaft. Wind every surface outward (it
renders single-sided). Do NOT hand-roll a bare sphere band (inside-out / hollow), and
do NOT make a full/near-full sphere. The ball nests with a little clearance; its top
cap + shaft poke out the top hole.
