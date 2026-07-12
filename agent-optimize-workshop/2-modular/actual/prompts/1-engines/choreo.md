# choreo engine — procedural beat generator

Scope: drive a set of pose channels on its own. Write values into a pose object in
place, so a bound UI tracks the motion and a drag hands control straight back.

## Contract

- Caller supplies the channels (each a key + range), a home pose, a seed.
- Advance by dt each frame; mutate the pose object in place.
- Targets read LIVE (a beat starts wherever the last one, or a drag, left off), aim
  into the far half of the channel's range, and favor clean grid angles.
- Now and then a beat snaps the WHOLE pose home instead (and anticipates with nothing).
- Seeded → a run replays. Beat period tunable.

## The beat — anticipation, move, bounce

Every beat runs the same routine:

1. pick the **main** sliders (1–3), aimed at fresh grid targets
2. pick the **anticipation** slider — a DIFFERENT one, which winds up on their behalf
3. the anticipation slider animates FIRST, leaning AGAINST the coming travel
4. the main sliders animate: the long move, flying PAST their targets
5. the main sliders BOUNCE down onto them, as the anticipation unwinds home

| phase | length | the main sliders | the anticipation slider |
|---|---|---|---|
| anticipation | short | hold still | lean against the travel, and hang there |
| move | **long** | accelerate out, fly past the target | unwind |
| bounce | short | rattle down onto the target, stop dead | arrive home as they land |

The two are DIFFERENT SHAPES, not one curve with a sign flip: the main move leaves
[0,1] at the far end (past the target, then back onto it); the anticipation is a pulse
out and back over a different span. **The wind-up belongs to another part than the one
that moves** — a limb that winds itself up reads as sprung; a body that counters itself
reads as having decided to move.

An anticipation lean is a fraction of that slider's own range, clamped to it: a wind-up
never throws a channel out of bounds.

## Demo page

When your engine is done, wire it into the shared engine demo page (create it if it
does not exist yet). The page: an orbit viewer, a tab bar grouped by subject kind,
a slider panel that rebuilds per subject, a caption. Building on it must not break
another engine's tabs already there.

Your part: a **play / pause** toggle that runs the choreographer over whatever
sliders the active subject shows, so the motion can be watched; a drag reclaims a
channel.
