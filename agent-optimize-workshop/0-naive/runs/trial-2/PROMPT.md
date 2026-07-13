# Requirement — a humanoid robot that poses and moves

Build a 3D humanoid robot that stands, poses, and dances on its own. Every shape
in the scene is generated in code — no models, no assets.

## The page

A single web page: a full-window canvas with an orbit camera (drag to rotate,
wheel to zoom), framed on the standing figure, and a control panel pinned to one
corner. Nothing to click to start — it loads and it is already alive.

## The robot

A standing humanoid, built entirely out of simple primitive shapes: head, torso,
pelvis, two arms ending in three-finger grippers, two legs with feet. It stands
on the ground — the soles touch, nothing floats or sinks.

It reads as a MACHINE, not a mannequin. Its joints are real mechanisms you can
see: a shoulder that is a hinge with a pin and a clevis, a wrist that bends on
one axis and tilts on another, a waist that is a ball in a socket. Parts meet at
those mechanisms instead of overlapping or floating apart, and a joint's rotation
happens where the mechanism actually pivots. Bending an arm never tears it open
or drives one part through another.

The figure is colored like a bin of plastic bricks: many colors, and two pieces
of the same shape at the same size always come out the same color.

## The controls

The panel holds one slider per pose channel — head yaw and pitch, waist twist,
bend and tilt, shoulder, arm out, elbow, wrist bend/tilt/twist, finger curl, hip,
knee — each with its live value. A slider drives BOTH sides of the body, so the
robot moves symmetrically. Dragging one reposes the robot immediately.

## The performance

Once standing, the robot moves on its own. It keeps striking new poses on beat,
about one per second, and each beat reads as a deliberate move rather than noise:

- The extremities lead. A beat opens with a couple of small joints (fingers,
  wrists, elbows) ramping into new angles — the anticipation.
- Then one big joint near the root (waist, shoulder, neck) makes the main move:
  it travels PAST its target, then bounces back down onto it, so the pose lands
  with weight.
- Then it holds, and the next beat starts from wherever it stopped.
- Targets snap to machine-square angles (multiples of 45 degrees) and always aim
  away from where the joint currently sits, so no beat is a twitch in place.
- Now and then the robot drops everything and snaps back to its rest pose, so it
  never drifts off into a permanent contortion.
- The legs are never choreographed. They stay under the robot holding it up, and
  remain yours to drag.

The sliders track the motion: the choreography drives the same values the sliders
are bound to, so the panel animates with the robot, and grabbing a slider hands
control straight back — the next beat plans from where you left it. The
choreographer and the hand never fight.

The whole show is seeded: same seed, same colors, same dance every run.
