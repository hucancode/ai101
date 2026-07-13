// mesh.js — the modeling engine: turns a prims.js source into a posable THREE.Mesh.
//
// Three is reached ONLY through gfx.js (which re-exports it for exactly this
// purpose); no module imports three.module.min.js directly. Nothing else in the
// project constructs a Mesh, so this is the single seam to the renderer.

import { THREE, geometryOf, translate, rotX, rotY, rotZ } from "./gfx.js";

// A mesh instance over a shared geometry. `matrixAutoUpdate = false` because the
// piece is placed by left-multiplying its own matrix (gfx translate/rot*), never
// by position/rotation properties — the scene-graph node above it does the posing.
export function mesh(src) {
  const m = new THREE.Mesh(geometryOf(src));
  m.matrixAutoUpdate = false;
  m.matrix.identity();
  return m;
}

// Declarative placement: place(src, { at, rx, ry, rz }).
// Rotations are applied about the piece's own centre, then it is moved to `at`
// (the transforms left-multiply, so the calls read outside-in: translate last).
export function place(src, { at = [0, 0, 0], rx = 0, ry = 0, rz = 0 } = {}) {
  const m = mesh(src);
  if (rz) rotZ(m, rz);
  if (ry) rotY(m, ry);
  if (rx) rotX(m, rx);
  if (at[0] || at[1] || at[2]) translate(m, at[0], at[1], at[2]);
  return m;
}
