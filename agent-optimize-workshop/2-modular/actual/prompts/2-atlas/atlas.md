# atlas — the robot

A standing humanoid mech, built as parts and a rig. Pure content — no new
geometry, mechanisms, or kinematics.

**Parts.** Each part is primitives plus joint halves with their bases. Its male
mount is its origin; the body hangs down and faces forward (head and torso grow
up). Each part offers a mount plus one female slot per child.

**Joint hardware (don't fight the engine).** The joint engine OWNS each piece's
rotating origin and seating — it rotates and places the raw mesh a maker returns.
So a maker returns the piece in the engine's documented canonical frame AS-IS; do
NOT add your own centering/translate to it (an extra offset shoves the clevis arms
or base plates off the joint, so the hardware sits crooked even when the kinematics
line up). Feed the engine's makers exactly the shapes it asks for and let it seat
them.

**Joints:**

| joint | joins | mechanism |
|---|---|---|
| neck | torso → head | ball |
| waist | pelvis → torso | ball (3 DOF) |
| shoulder | torso → upperArm | L-seated hinge (arm swings OUT from the seat, not a plain down-hinge) |
| elbow | upperArm → forearm | hinge |
| wrist | forearm → palm | universal (two hinges) |
| knuckle | palm → finger | bare pin |
| hip | pelvis → thigh | L-seated hinge (use the engine's L-seat/90° corner, not a plain down-hinge) |
| knee | thigh → shin | hinge |
| ankle | shin → foot | hinge |

**The 11 parts** — shape, and the joint halves each carries:

- **head** — cylinder drum, face on the flat disc, rings + ear pods; neck ball below.
- **torso** — slab chest (core box + rounded flanks + panel) on a waist box; neck socket up, an arm seat on each flank, waist ball below.
- **pelvis** — half-cylinder shell under a disc; waist socket up, hip halves on its end faces. The root.
- **upperArm** — biceps cylinder; the whole shoulder joint above, the elbow clevis below.
- **forearm** — a box from the elbow down to the wrist's first-stage clevis.
- **wrist** — the middle link: the first-stage tongue above, the whole second stage below, the two sharing a base.
- **palm** — a block on the wrist's second-stage disc, twisting with it; fingers on its side faces, one behind and two in front.
- **finger** — 3 box digits on bare pins, curling toward each other.
- **thigh** — box; hip tongue above, knee clevis below.
- **shin** — barrel; knee tongue above, ankle clevis below.
- **foot** — an ankle base box, slope + toe forward, heel back, one sole plane; ankle tongue on the base.

**Rig.** A declarative link list wiring parts parent-to-child by slot mating,
mapping pose channels to joint axes. The rig assembles ONCE into a posable node
tree, then a pose call just sets each joint's angle — nothing rebuilt per frame,
built stands on the grid. Left and right are separate links on the same channels,
so the mech is symmetric with no mirrored geometry. The arm carries and swings
within its own shoulder joint; the wrist is a two-stage universal; the fingers
curl their inner digits.

**Mating (get the spacing right — this is where parts dislocate).** A joint is NOT
a zero-length pivot; it occupies real space between the two parts. A child seats so
its MALE mount face meets the parent's FEMALE slot face: the child is pushed out
from the parent slot along the slot normal by the JOINT'S SPAN — the engine's mount
offsets (female seat/reach + male reach), NOT butted onto the slot point. Use the
engine's mating to solve the rest rotation AND the seated position from those mount
frames. A part's female slot sits on its own body surface; the child's body then
begins one joint-span beyond it, so hardware and bodies connect flush — no gap, no
overlap. Never place a child origin directly on the parent slot.

**Channels** (both sides): head yaw / pitch; waist twist / bend / tilt; shoulder,
arm-out, elbow; wrist bend / tilt / twist; finger curl; hip, knee.

**Motion.** Drive with the choreographer. The legs hold the mech up, so keep them
hand-only — the choreographer never sees hip/knee. A drag hands control back.

**Deliver a page:** the mech stands on the grid — head, torso, pelvis, two arms
with 3-finger grippers, two legs with feet — idling under the choreographer, every
channel also draggable.
