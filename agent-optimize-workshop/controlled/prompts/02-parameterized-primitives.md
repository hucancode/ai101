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

## Shape identities

- **`key`** = unit-mesh identity. Builder name + shape ratios + segment counts.
  Size excluded. One mesh generated per key into a module-level registry; every
  handle with that key shares that one mesh object. `meshOf(key)` looks it up.
- **`id`** = shape identity **with** size: key + creation scale. Rotation and
  translation never change it. Consumers color by `id`, so identical pieces match
  like lego part numbers.

Quantize params before they enter a key or an id, else float noise splits them.

## Parameters

Shape params are ratios wherever possible, so width / height / depth / radius stay
**pure scale axes**:

- box `slope` = fraction of height
- `coneCut` taper = `r1/r0`
- `cutHemisphere` `t` and `cut` = fractions of `r`
- arch box `depth` = fraction of `r`

## Transform algebra

Chainable. Matrix composition only, never vertex work.

- `translate(h, x, y, z)`
- `rotX / rotY / rotZ (h, angle)` — rotates the matrix **and** the translation, so
  a handle moves rigidly about the current origin
- `bake(h)` → finalized `{ key, id, mesh, m, t }` for the item list

## Builder catalog

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
## Data contract

```js
items: [{ mesh: { positions, normals }, m: [9 /* row-major 3x3 */], t: [x, y, z],
          color?: [r, g, b] }]
```

`drawer.draw(items)` per frame. A baked handle IS an item — it carries its
registry mesh by reference, so it draws as-is, and identical shapes cost one mesh,
not N.

## Deliver

`primitives.js`, `main.js`, `index.html`. Demo = interactive parameter inspector:
pick a builder, one slider per parameter, live readout of the handle's `id`.

Every builder selectable, every param live. `id` changes with size or shape, never
with rotation or translation. No missing or inside-out faces at any slider
setting.
