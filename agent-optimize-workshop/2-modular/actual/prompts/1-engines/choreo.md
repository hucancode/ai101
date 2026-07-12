# choreo engine — procedural beat generator

Scope: drive a set of pose channels on its own. Write values into a pose object in
place, so a bound UI tracks the motion and a drag hands control straight back.

## Contract

- Caller supplies the channels (each a key + range), a home pose, a seed.
- Advance by dt each frame; mutate the pose object in place.
- **Each beat:** pick 1–3 channels at random. Each ramps from where it sits now to
  a fresh target with an overshoot-and-settle ease — travel aims PAST the target,
  then reels back exactly onto it.
- Targets read LIVE (a beat starts wherever the last one, or a drag, left off), aim
  into the far half of the channel's range, and favor clean grid angles.
- Now and then a beat snaps the WHOLE pose home instead.
- Seeded → a run replays. Beat period tunable.

## Demo page

When your engine is done, wire it into the shared engine demo page (create it if it
does not exist yet). The page: an orbit viewer, a tab bar grouped by subject kind,
a slider panel that rebuilds per subject, a caption. Building on it must not break
another engine's tabs already there.

Your part: a **play / pause** toggle that runs the choreographer over whatever
sliders the active subject shows, so the motion can be watched; a drag reclaims a
channel.
