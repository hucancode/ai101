// Slots — full frames (origin, outward normal, forward tangent) that let one
// catalog entry seat cleanly against another. Only the joints consumers
// chain through publish slots, one per half: ball1, and the mount-to-mount
// hinge (there the tangent is the pin axis).
//
// Every number here is read from joints.js's own derived-dimension
// functions (hingeDims / ball1Dims) and the same MOUNT_REST_SWING constant
// the geometry bakes in, so a slot can never drift from what it seats on.
import { vAdd, vSub, vScale, vCross, vNorm, m3Mul, m3MulV, m3T } from "./math.js";
import { hingeDims, ball1Dims, MOUNT_REST_SWING } from "./joints.js";

// A slot is {o, n, t, b}: origin, outward normal, forward tangent, binormal
// (n,t,b right-handed). `tangent` is re-orthogonalized against `normal` so
// callers can pass an approximate forward direction.
export function slot(origin, normal, tangent) {
  const n = vNorm(normal);
  const raw = vNorm(tangent);
  const d = raw[0] * n[0] + raw[1] * n[1] + raw[2] * n[2];
  const t = vNorm(vSub(raw, vScale(n, d)));
  const b = vCross(n, t);
  return { o: origin.slice(), n, t, b };
}

// Mirror a slot across the plane perpendicular to `axis` — the other flank
// of a symmetric rig.
export function mirrorSlot(s, axis = "x") {
  const i = { x: 0, y: 1, z: 2 }[axis];
  const flip = (v) => v.map((c, k) => (k === i ? -c : c));
  return slot(flip(s.o), flip(s.n), flip(s.t));
}

// Solve the rigid transform {m,t} that seats `child`'s slot onto `parent`'s:
// origins coincide, forwards align, normals oppose. Apply the result to a
// child assembly's items with applySeat().
export function seat(child, parent) {
  const childBasisT = [...child.n, ...child.t, ...child.b]; // rows = child's own basis => child's inverse
  const pn = parent.n.map((x) => -x);                       // normals oppose
  const pb = vCross(pn, parent.t);
  const targetT = [...pn, ...parent.t, ...pb];               // rows = target basis => target's inverse
  const target = m3T(targetT);                               // undo the transpose to get the basis itself
  const m = m3Mul(target, childBasisT);                      // R = target * child^-1
  const t = vSub(parent.o, m3MulV(m, child.o));
  return { m, t };
}

// Apply a seat transform to already-baked items (as produced by collect()):
// new m = xf.m * item.m, new t = xf.m * item.t + xf.t — the same rule
// primitives.js's own rotX/rotY/rotZ use to carry a placed handle further.
export function applySeat(items, xf) {
  return items.map((it) => ({
    ...it,
    m: m3Mul(xf.m, it.m),
    t: vAdd(m3MulV(xf.m, it.t), xf.t),
  }));
}

// ---------------------------------------------------------------------------
// ball1 slots — female at the thin base's outward (down) face, male at the
// plate's outward (up) face; both at rest (pose = identity).
// ---------------------------------------------------------------------------
export function ball1Slots(params = {}) {
  const d = ball1Dims(params);
  const female = slot([0, -d.socketDrop - d.baseT, 0], [0, -1, 0], [0, 0, 1]);
  const male = slot([0, d.shaftLen + d.plateT, 0], [0, 1, 0], [0, 0, 1]);
  return { female, male };
}

// ---------------------------------------------------------------------------
// mount-to-mount slots — the tangent is the pin axis (X, invariant under the
// rest-swing rotX). Mount-1 (female) keeps its natural +Y outward normal;
// mount-2 (male) is carried by the same MOUNT_REST_SWING rotX the geometry
// bakes in, so its origin/normal are that rotation applied to the unswung
// (opens-up) base point/normal — the exact rotAxis(i=1,j=2) rule joints.js
// uses internally, kept in lockstep here.
// ---------------------------------------------------------------------------
export function mountSlots(params = {}) {
  const d = hingeDims(params);
  const female = slot([0, d.reach + d.baseT, 0], [0, 1, 0], [1, 0, 0]);

  const c = Math.cos(MOUNT_REST_SWING), s = Math.sin(MOUNT_REST_SWING);
  const rot = (v) => [v[0], c * v[1] - s * v[2], s * v[1] + c * v[2]];
  const male = slot(rot([0, -(d.reach + d.baseT), 0]), rot([0, -1, 0]), [1, 0, 0]);

  return { female, male };
}
