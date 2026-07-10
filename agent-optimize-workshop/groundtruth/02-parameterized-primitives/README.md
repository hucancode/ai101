# 02 — Parameterized Primitive Builder & Render

Builds on 01 (triangle-soup generators). New layer: a builder API that turns
generators into cheap, transformable primitives.

## Problem statement

Placing raw soups by hand doesn't compose: a machine model needs hundreds of
boxes and cylinders posed relative to each other. Design a builder layer
where a primitive call returns a **handle**

```js
{ key, id, mesh: { positions, normals }, m: [9 /* row-major 3x3 linear */], t: [x, y, z] }
```

— a **unit mesh** (generated at unit proportions) plus an affine transform
carrying the real size. After generation there is no vertex work: sizes go
into the starting scale matrix, and placement composes into `m`/`t`.

Shape parameters are ratios where possible (box slope = fraction of height,
cone taper = `r1/r0`, arch-box depth as a fraction of r), so
width/height/radius stay pure scale axes.

Two identities, and the difference matters:

- `key` = the **unit mesh** identity: builder + shape ratios + segment counts,
  size excluded. Meshes are generated once per key into a module-level
  `REGISTRY` and every handle with that key shares the same mesh object, so a
  renderer can batch by key (`meshOf(key)` looks one up).
- `id` = shape identity **including size** (key + creation scale; rotation and
  position don't change it). Consumers color by `id` so identical pieces match,
  like lego part numbers.

Handles compose through a chainable transform algebra — matrix composition
only, never vertex work: `translate`, `rotX/rotY/rotZ` (each rotates the
matrix AND the translation, so a handle moves rigidly about the current
origin), then `bake(handle)` finalizes `{ key, id, mesh, m, t }` for the item
list.

Builder catalog (signatures from the ground truth):

```js
box(w, h, d, slope, curve)        cylinder(r, h, seg)
coneCut(r0, r1, h, seg)           cone(r, h, seg)
sphere(r, seg, rings)             hemisphere(r, seg, rings)
cutHemisphere(r, t, cut, seg, rings)   // socket shell; t/cut = fractions of r
halfCylinder(r, h, seg)           halfCylinderBox(r, h, depth, seg) // arch box
quarterCylinder(r, h, seg)
```

New generators beyond 01: `genCutHemisphere` (outer shell + inner cavity +
lip/base rings), `genHalfCylinder`/`genHalfCylinderBox`/`genQuarterCylinder`
(arc sweeps + closing walls).

## Scope

In scope:
- The mesh `REGISTRY` + `meshOf`, the handle factory `H` (unit mesh +
  pure-scale starting matrix + `key`/`id`), parameter quantization (`q4`) for
  stable keys and ids.
- Handle transform algebra: `translate`, `rotAxis`-based `rotX/rotY/rotZ`
  (rotates both matrix and translation), `bake`.
- Full builder catalog + their generators.
- Demo: interactive parameter inspector — builder selector + a slider per
  parameter, with a live readout of the handle's `id`.

Out of scope: joints (03), robots (04), assembly animation (05),
choreography (06).

## Data contract

Same harness contract as 01: baked handles ARE items (`mesh`, `m`, `t`).
A handle carries its `mesh` by reference to the registry entry, so a baked
item is drawable as-is and identical shapes cost one mesh, not N.

## Run

```bash
python -m http.server 8000   # from workshop root
# open http://localhost:8000/02-parameterized-primitives/
```
