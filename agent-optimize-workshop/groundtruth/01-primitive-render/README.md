# 01 — Primitive Render

## Problem statement

Generate 3D primitive meshes from scratch — as raw triangle soup with correct
normals — and render them lit in the browser. No mesh library: every vertex
position and normal is computed by your code.

A mesh is `{ positions: number[], normals: number[] }`: 3 floats per vertex,
3 vertices per triangle, no index buffer. Flat faces share one face normal
across the triangle; curved surfaces need per-vertex normals so lighting
shades smoothly across the surface.

Implement generators for:

- **box** — unit cube, centered. Bonus params: `slope` (fraction of height
  dropped at the top face's front edge) and `curve` (-1 concave .. +1 convex
  bend of the sloped top, needs subdivision).
- **cylinder** — arc sweep of a side wall + top/bottom cap fans. Parameterize
  by radius, height, segment count, and swept angle range (so a half or
  quarter cylinder falls out of the same code).
- **cone / truncated cone** — base r=1 at y=0, top r=q at y=1; q=0 is a true
  cone. Side normals must tilt with the slope.
- **sphere / hemisphere** — a lathe: sweep phi from the pole to `phiMax`,
  rings x segments; hemisphere closes its base with a downward disc. On a unit
  sphere the vertex position IS the normal.

## Scope

In scope:
- Triangle-soup helpers: `geo`, `tri` (flat normal), `triS` (per-vertex
  normals), `quad`, `merge`, `soupTranslate`.
- The four generators above, with documented origin conventions
  (cylinder: base-circle center, y 0..h; box/sphere: centered; hemisphere:
  base-circle center, dome up).
- A demo page rendering one of each, lit, with orbit camera (harness
  provided in `render.js`).

Out of scope (later problems):
- Builder handles, transform algebra (02).
- Joints, robots, animation (03–05).

## Data contract

The harness (`render.js`) consumes:

```js
items: [{ mesh: { positions: Float32Array, normals: Float32Array },
          m: [9]  /* row-major 3x3, use identity here */,
          t: [x, y, z], color?: [r, g, b] }]
```

`createViewer(canvas)` + `createDrawer(scene)`; call `drawer.draw(items)`
per frame.

## Run

```bash
# from the workshop root
python -m http.server 8000
# open http://localhost:8000/01-primitive-render/
```
