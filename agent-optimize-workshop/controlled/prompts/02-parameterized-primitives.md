# Prompt 02 — parameterized primitive builder

## Task

Add a **builder layer** over the generators.

A builder call returns a **handle**:

```js
{ key, id, mesh: { positions, normals }, m: [9 /* row-major 3x3 linear */], t: [x, y, z] }
```

Mesh generated at **unit proportions**. Real size lives in the starting scale
matrix. After generation, no vertex work ever again — placement composes into
`m` / `t`.

## Transform algebra

Chainable. Matrix composition only, never vertex work.

- `translate(h, x, y, z)`
- `rotX / rotY / rotZ (h, angle)` — rotates the matrix **and** the translation, so
  a handle moves rigidly about the current origin
- `bake(h)` → finalized `{ key, id, mesh, m, t }` for the item list

## Builder catalog — 12

```js
box(w, h, d, slope, curve) 
cylinder(r, h, seg)
coneCut(r0, r1, h, seg)
sphere(r, seg, rings)
hemisphere(r, seg, rings)
cutHemisphere(r, t, cut, seg, rings)
halfCylinder(r, h, seg)
halfCylinderBox(r, h, depth, seg)
```

Every parameter has a sensible default. Bare `box()` works.

New generators:

- **cutHemisphere** — socket shell. Outer dome, inner cavity, lip ring closing the
  opening, base ring closing the cut. `t` = wall thickness. `cut` = the height of
  the **horizontal cut plane** — one plane, cutting both surfaces.
- **halfCylinder / quarterCylinder** — partial arc sweeps, closed by flat walls on
  the cut faces.
- **halfCylinderBox** — arch box: half cylinder capping a box. A D-plate on its
  side.

## Deliver

`primitives.js`, `main.js`, `index.html`. Demo = interactive parameter inspector:
pick a builder, one slider per parameter, live readout of the handle's `id`.

Every builder selectable, every param live. `id` changes with size or shape, never
with rotation or translation. No missing or inside-out faces at any slider
setting.
