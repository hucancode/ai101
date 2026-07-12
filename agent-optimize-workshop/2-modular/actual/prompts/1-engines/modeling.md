# modeling engine — solids you compose by their faces

Scope: generate solids, and place them against each other. No joints. No color.

## Two builders — every solid is one of these

- **`extrude(outline, depth)`** — a closed 2-D polygon pushed along an axis.
- **`lathe(outline, arc)`** — a closed 2-D profile revolved around +Y.

An outline is a CLOSED loop wound counter-clockwise in its plane; an edge's outward
normal is its direction turned −90°; a point may be flagged *smooth* (its two edges
average, so arcs shade round while rims stay crisp); it must be star-shaped about its
centroid (caps are fanned from it).

A closed outline swept is a closed solid — caps and rims close themselves, every face
comes out wound outward. Nothing else may emit triangles. Repair the winding at
generation (flip a triangle whose winding disagrees with its own outward normal), so
an inside-out or hollow mesh is not expressible rather than merely discouraged.

## Three cores

| solid | params |
|---|---|
| box | w, h, d, `slope` (drops the top's +Z edge), `curve` (bends that slope, −1 concave .. +1 convex) |
| cylinder | r, h, `axis` (the barrel's axis) |
| halfCylinder | r, h, `axis`, `round` (which way the curved side bulges) |

**Origin: every solid is centred on its own bounding box.** One rule, so no caller
does half-height arithmetic.

A call returns a HANDLE: a shared unit mesh (one per distinct proportions, so
instances batch), a rigid transform, a scale. Proportions (slope, curve, arc, segment
counts) fix the unit mesh; w/h/d/r stay pure scale. Its stable IDENTITY = proportions
+ size, so a consumer colours identical pieces alike.

## Faces and sections

A **face** is a named frame on a solid: `{ pos, n, u, v, sec }`, `u × v = n`. A box has
`top/bottom/left/right/front/back`; a barrel has its two caps plus a `side` boss swung
round the axis by an angle. A caller NAMES a face — never a position, never a normal —
so a frame cannot drift from the geometry that owns it.

A face's **section** is the cross-section cutting there: `rect(w,d)`, `disc(r)`,
`halfDisc(r)`. Expose `inradius(sec)` (its largest contained circle) and
`plate(sec, t)` (a slab of that shape). The joint engine sizes its hardware from
sections, so a joint's plate is exactly the face it lands on.

**`seat(faceA, faceB, gap)`** — the rigid transform laying B flat on A: origins
coincide, `u` axes align, normals OPPOSE. Every placement in the system is this call.

## Parts

Pieces plus faces. A part never writes a coordinate.

- `piece(mesh)` — a free-standing solid.
- `join(host, hostFace, mesh, meshFace, { gap, u, v, flush })` — seat a piece on a face.
  `u`/`v` slide it across that face in fractions of its half-extents; `flush` re-aligns
  a named side of both (a foot's sole stays one plane).
- `anchor(name, piece, face)` — offer a face to a child. It carries NO dimension: the
  child's plug sizes the joint.
- `mount(piece, face, { scale, round })` — the face this part plugs into its parent by.
  `scale` shrinks the plug; `round` makes it a disc.
- `finish()` — re-base so the mount face is the origin, its normal +Y, the body hanging
  −Y. Preserve FORWARD: turn the mount normal onto +Y and leave +Z pointing +Z.
  (Aligning the face's `u` instead spins a drum-shaped part sideways.) Returns the
  part's meshes, its anchors, and its plug section.

## Demo page

Wire into the shared engine demo page (create it if absent): orbit viewer, tab bar
grouped by subject kind, a slider panel that rebuilds per subject. Do not break
another engine's tabs.

Yours: a **shapes** tab group — one tab per core, sliders = its params, origin marked,
faces overlaid with their frames.
