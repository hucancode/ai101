## Task

Make 3D primitive meshes from scratch, then a **builder layer** over them. Raw
triangle soup. No mesh library. Your code computes every position, every normal.

Mesh = `{ positions: Float32Array, normals: Float32Array }`. 3 floats per vertex,
3 vertices per triangle, no index buffer.

Two normal disciplines:

- **flat face** (wall, cap, disc) — triangle shares one face normal. Crisp
  machined edge.
- **curved surface** (cylinder wall, cone flank, sphere) — per-vertex surface
  normal. Shades smooth, no faceting.

Winding CCW seen from outside. Harness culls back faces. Inside-out triangle
shows as hole or dark patch.

Soup helpers — empty soup, flat triangle, smooth triangle, quad, merge,
translate-in-place. Every generator uses them.

## Generators

Origin conventions load-bearing. Consumers seat shapes by their origin.

- **box** — unit proportions, centered on origin. `slope` = fraction of height
  dropped at the top face's **front (+Z) edge**; top becomes a ramp, front wall
  shortens, side walls become trapezoids. `curve` bends that ramp, −1 concave ..
  +1 convex; needs the ramp subdivided.
- **cylinder** — arc sweep. Side wall swept about +Y, radial per-vertex normals.
  Cap fans top and bottom, from the axis. Origin = base circle center, body spans
  y 0..h. A **swept angle range** gives the half cylinder from the same sweep.
- **truncated cone** — base radius at y=0, top radius at y=h. Flank normals **tilt
  with the slope**, never radial.
- **sphere / hemisphere** — lathe. Polar angle swept from the pole, rings ×
  segments. On a unit sphere the position IS the normal. Hemisphere origin = base
  circle center, dome up, base closed by a downward disc.
- **cut hemisphere** — socket shell. Outer dome, inner cavity, lip ring closing
  the opening, base ring closing the cut. `t` = wall thickness. `cut` = the height
  of the **horizontal cut plane** — one plane, cutting both surfaces.
- **arch box** — half cylinder capping a box. A D-plate on its side.

## Builders

Raw soups don't compose. A machine needs hundreds of boxes and cylinders posed
against each other. A builder call returns a **handle**:

```js
{ key, id, mesh: { positions, normals }, m: [9 /* row-major 3x3 linear */], t: [x, y, z] }
```

Mesh generated at **unit proportions**. Real size lives in the starting scale
matrix. After generation, no vertex work ever again — placement composes into
`m` / `t`.

## Two identities. Difference matters.

- **`key`** = unit-mesh identity. Builder name + shape ratios + segment counts.
  Size excluded. One mesh generated per key into a module-level registry; every
  handle with that key shares that one mesh object. `meshOf(key)` looks it up.
- **`id`** = shape identity **with** size: key + creation scale. Rotation and
  translation never change it.

Quantize params before they enter a key or an id, else float noise splits them.

## Ratios, not absolutes

Shape params are ratios wherever possible, so width / height / depth / radius stay
**pure scale axes**: box `slope` = fraction of height; truncated-cone taper =
`r1/r0`; cut-hemisphere `t` and `cut` = fractions of `r`; arch box `depth` =
fraction of `r`.

## Transform algebra

Chainable. Matrix composition only, never vertex work.

- `translate(h, x, y, z)`
- `rotX / rotY / rotZ (h, angle)` — rotates the matrix **and** the translation, so
  a handle moves rigidly about the current origin
- `bake(h)` → finalized `{ key, id, mesh, m, t }` for the item list

## Catalog — 8

```js
box(w, h, d, slope, curve)              cylinder(r, h, seg)
coneCut(r0, r1, h, seg)                 sphere(r, seg, rings)
hemisphere(r, seg, rings)               cutHemisphere(r, t, cut, seg, rings)
halfCylinder(r, h, seg)                 halfCylinderBox(r, h, depth, seg)
```

Every parameter has a sensible default. Bare `box()` works.

## Identity coloring

Hash a shape's `id` into a curated palette. Identical pieces get the same color,
lego-style. A new seed reshuffles the mapping and keeps that property. A memoized
form, for consumers that re-color the same ids every frame.

One helper — `collect(builderFn, seed, params, pose)` → `{ items, meshes }` — runs
a builder function, bakes what it emits into colored items, and gathers the unit
meshes they reference, one per key. Every consumer models through it.

## Harness contract

```js
items: [{ mesh: { positions, normals }, m: [9 /* row-major 3x3 */], t: [x, y, z],
          color?: [r, g, b] }]
```

`drawer.draw(items)` per frame. A baked handle IS an item — it carries its
registry mesh by reference, so it draws as-is, and identical shapes cost one mesh,
not N.

The canvas owns the viewport. The control panel floats over it.

## Deliver

`primitives.js`, `color.js`, `main.js`, `index.html`. Demo = interactive parameter
inspector: pick a builder, one slider per parameter, live readout of the handle's
`id`, the shape colored by that `id`.

Every builder selectable, every param live. `id` changes with size or shape, never
with rotation or translation. Curved shades smooth, flat shades crisp. No missing
or inside-out faces at any slider setting.
