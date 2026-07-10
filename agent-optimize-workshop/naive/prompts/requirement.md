# Requirement — a humanoid robot that assembles itself

Build a 3D humanoid robot (Atlas-style) that assembles itself, poses, and moves.

Every shape is generated in code. No downloaded models, no scanned meshes, no
asset files — the robot is procedural, down to the last pin.

## The robot

A standing humanoid, built entirely out of simple primitive shapes: head, torso,
pelvis, two arms ending in three-finger grippers, two legs with feet. It stands on
the ground.

Identical pieces share a color, like lego part numbers.

## The joints

Every connection between two body parts is a **visible mechanical joint** you
could machine:

- hinges — a real pin running through interleaved knuckles
- ball-and-socket — the ball sits cupped inside a socket
- a waist that twists and bends

The two halves of a joint mesh, and stay meshed while the joint moves. Nothing
interpenetrates, nothing floats apart, no rotation happens outside its mechanism.

## Posing

The robot is posable — head, torso twist, shoulders, elbows, wrists, finger curl,
hips, knees. Each rotation happens inside the mechanism built for it.

## The build animation

One progress control `u ∈ [0, 1]` drives the whole build.

At `u = 0` the scene is empty. At `u = 1` the robot stands complete.

Between: pieces fly in and snap together into sub-assemblies, then the finished
sub-assemblies fly to the body and plug into their mounts. Root first, outward to
the fingertips.

Scrub the control back and forth — the same `u` always shows the same frame. The
build replays exactly.

## The performance

Once built, the robot moves on its own. It keeps inventing new poses: the
extremities lead, the big joints overshoot their target and settle onto it.

## Camera

Orbit and zoom.
