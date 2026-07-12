# modeling engine — procedural primitives

Scope: generate shapes. Primitives only. No joints. No color.

## Contract

- Each primitive call returns one mesh handle. Composing transforms (translate,
  rotate) move a handle rigidly — no vertex work after the call.
- Shape set by RATIOS; size is pure scale. Two handles of the same proportions
  (any size) share one unit mesh, so they batch.
- Each handle carries a stable IDENTITY = proportions + size. Equal identity →
  equal handle, so a consumer colors identical pieces alike.
- Every primitive has one fixed, documented default ORIGIN a consumer seats it by.
- Every mesh is a CLOSED surface with OUTWARD normals: every face wound so its
  normal points OUT of the solid, so a front-face-culling material shows it and
  lighting reads right. No inward-facing or missing faces. Test each primitive:
  every face normal points away from the shape's interior.

## Primitives

| shape | params | origin |
|---|---|---|
| box | w, h, d, slope, curve | center |
| cylinder | r, h, seg | base-circle center, grows +Y |
| coneCut | r0 (base), r1 (top), h, seg | base center, +Y |
| sphere | r, seg, rings | center |
| cutDome | r, wall, cut, seg, rings | base-rim (equator) center = sphere center; dome +Y with a top hole |
| halfCylinder | r, h, seg | base half-circle center, round side +Z, flat on XY, +Y |
| archBox | r, h, depth, seg | cylinder-circle center |

Notes:
- **box** — `slope` = fraction of height dropped at the top front (+Z) edge;
  `curve` bends that sloped top (−1 concave .. +1 convex).
- **coneCut** — `r1=0` gives a true cone.
- **cutDome** — the ball SOCKET: take a DOME (the upper half of a sphere) and slice
  the top pole off. Keep the TOP part: base rim (widest circle, full radius) at the
  origin plane (the equator, = the sphere center), wall curving up and inward toward
  +Y, top sliced into a small round HOLE at +Y (the shaft exit). So it caps a ball
  from above — the ball nests up under the dome, its top cap + shaft poke out the top
  hole, and the wide skirt at the equator is the ball's entry. Double-walled shell
  (outer + inner surface, inner facing the cavity) with BOTH cut edges closed by rings
  (bottom skirt rim + top hole rim). `wall` = shell thickness, `cut` = fraction of the
  top removed = the hole size — both FRACTIONS of r. All surfaces normalled outward.
- **archBox** — a half cylinder plus a box body reaching back to `depth`.

Ratios (slope, curve, taper, wall, cut, arch depth, segment counts) fix the unit
mesh; w/h/d/r/len stay pure scale.

## Demo page

When your engine is done, wire it into the shared engine demo page (create it if it
does not exist yet). The page: an orbit viewer, a tab bar grouped by subject kind,
a slider panel that rebuilds per subject.

Your part: a **shapes** tab group — one tab per primitive; its sliders are the
primitive's own params; a marker at the origin overlaid.
