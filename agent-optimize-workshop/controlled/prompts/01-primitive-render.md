# Prompt 01 — primitive render

## Task

Make 3D primitive meshes from scratch. Raw triangle soup. No mesh library. Your
code computes every position, every normal.

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

Origin conventions load-bearing. Later steps seat shapes by their origin.

- **box** — unit proportions, centered on origin. Extra params: `slope` = fraction
  of height dropped at the top face's **front (+Z) edge**; top becomes a ramp,
  front wall shortens, side walls become trapezoids. `curve` bends that ramp,
  −1 concave .. +1 convex; needs the ramp subdivided.
- **cylinder** — arc sweep. Side wall swept about +Y, radial per-vertex normals.
  Cap fans top and bottom, from the axis. Origin = base circle center, body spans
  y 0..h. Params: radius, height, segments, **swept angle range** — half and
  quarter cylinder fall out of this same sweep.
- **cone / truncated cone** — base radius at y=0, top radius at y=h. Top radius 0
  = true cone. Flank normals **tilt with the slope**, never radial.
- **sphere / hemisphere** — lathe. Polar angle swept from the pole, rings ×
  segments. On a unit sphere the position IS the normal. Hemisphere origin = base
  circle center, dome up, base closed by a downward disc.

## Harness contract

```js
items: [{ mesh: { positions, normals },
          m: [9]  /* row-major 3x3 — identity here */,
          t: [x, y, z], color?: [r, g, b] }]
```

`drawer.draw(items)` per frame.

## Deliver

`primitives.js`, `main.js`, `index.html`. Page shows a lit row: box, sloped box,
curved-slope box, cylinder, cone, truncated cone, sphere, hemisphere.

Curved shades smooth. Flat shades crisp. No missing faces, no dark faces. Orbit
and zoom work. Console clean.
