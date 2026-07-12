# atlas — the robot

A standing humanoid mech: parts and a rig. Pure content — no new geometry, no
mechanisms, no kinematics. If you find yourself writing a coordinate, an offset, a
joint dimension or a rest rotation, the engines are being fought rather than used.

## Parts

Each part is ONE core solid (plus trim that carries no joints), a few named ANCHORS
(faces it offers a child) and one MOUNT (the face it plugs into its parent by).

| part | core | trim |
|---|---|---|
| head | cylinder drum, axis forward — the face is its flat disc | rings on the face, ear pods on the barrel |
| torso | box | a rounded half-cylinder flank each side, a front panel |
| pelvis | disc (the rig's root) | a half-cylinder crotch slung under it |
| upperArm, shin | cylinder | |
| forearm, palm, digit, thigh | box | |
| foot | box (the ankle) | a sloped toe box forward, a heel box back — one sole plane |

Place trim by JOINING it to a face of the core. Offer a child by ANCHORING a face.
Nothing in this file names a socket, a tongue or a disc: the joint engine grows the
hardware out of the anchor, at the size of the limb that lands on it.

The mount is what sizes every joint the part plugs into — `scale` shrinks the plug
(a torso does not hang off the full width of its chest), `round` makes it a disc.

## Rig

A link list. Each link says four things and no more: which part, whose face it hangs
off, which MECHANISM joins them, and where the limb should AIM (`along` the parent's
body or `against` it). The engine derives the size, the hardware, the seating, the
rest rotation and the bones.

| joint | joins | mechanism |
|---|---|---|
| neck | torso → head | ball |
| waist | pelvis → torso | ball |
| shoulder | torso → upperArm | hinge + collar, aiming against the torso (the arm hangs down off a flank and spins in its seat) |
| elbow | upperArm → forearm | hinge |
| wrist | forearm → palm | universal (+ twist collar) |
| knuckle | palm → digit, digit → digit | hinge |
| hip | pelvis → thigh | hinge + collar, aiming along |
| knee, ankle | thigh → shin → foot | hinge |

Three digits chained make a finger; three fingers per palm — one on the BACK face,
two on the front. The back one's face points the other way, so its pin comes out
reversed and ONE curl channel closes it onto the other two; `roll` turns it to face
them and carries its whole chain round with it.

Left and right are the same links on the same channels, hung off opposite faces. No
geometry is mirrored and no drive sign is flipped by hand: a mirrored face gives a
mirrored pin. The exception is a channel whose sense must SURVIVE the mirror (both
arms swing forward, not apart) — mark those `parallel`. Only the two spin collars
need it.

The rig assembles ONCE into a posable node tree; a pose call only sets bone angles.
Nothing is rebuilt per frame. It stands on the grid.

**Channels** (both sides): head yaw/pitch; waist twist/bend/tilt; shoulder, arm-out,
elbow; wrist bend/tilt/twist; finger curl; hip, knee.

## Motion

Drive with the choreographer. The legs hold the mech up, so keep them hand-only — the
choreographer never sees hip/knee. A drag hands control back.

## Check

Ship a check that builds the rig headlessly and asserts what a render would show:
every part's plug fits the face it lands on; every mesh transform is finite; the mech
stands on the grid; **every joint is seated** — the measured distance from the anchor
face to the rotation centre is exactly the joint's `seat`, and from the centre to the
child's root face exactly its `reach`; every unit mesh is closed with outward normals
(a positive signed volume); and every channel stays finite across its whole range.

## Deliver a page

The mech stands on the grid — head, torso, pelvis, two arms with 3-finger grippers,
two legs with feet — idling under the choreographer, every channel also draggable.
