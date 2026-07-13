// Math kit for the mech workshop. Three.js already implements every rotation,
// matrix and quaternion operation the mech needs, so this file does not repeat
// them — it adapts them to the plain-array item contract (`m` = 9 numbers
// row-major, `t` = 3) and adds the three things Three.js has no answer for:
// easing curves, a seeded PRNG, and TAU.
import * as THREE from "./three.module.min.js";

const _a3 = new THREE.Matrix3();
const _b3 = new THREE.Matrix3();
const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();

// `Matrix3.set()` takes row-major arguments but stores column-major, so reading
// a row-major array back out transposes the element order. Same for the
// rotation block of a Matrix4.
const rows3 = (e) => [e[0], e[3], e[6], e[1], e[4], e[7], e[2], e[5], e[8]];
const rows4 = (e) => [e[0], e[4], e[8], e[1], e[5], e[9], e[2], e[6], e[10]];

// ---- scalar ----------------------------------------------------------------

export const TAU = Math.PI * 2;
export const rad = THREE.MathUtils.degToRad;
export const clamp = THREE.MathUtils.clamp;
export const lerp = THREE.MathUtils.lerp;
export const smooth = (x) => THREE.MathUtils.smoothstep(x, 0, 1);

// ---- vec3 ------------------------------------------------------------------
// Element ops on the array contract itself, not a vector library: wrapping
// THREE.Vector3 here would cost more code and an allocation per call.

export const vAdd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const vSub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const vScale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const vLen = (a) => Math.hypot(a[0], a[1], a[2]);
export const vNorm = (a) => vScale(a, 1 / (vLen(a) || 1));
export const vCross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

// ---- 3x3, row-major flat arrays --------------------------------------------

export const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

export const m3Mul = (a, b) => rows3(_a3.set(...a).multiply(_b3.set(...b)).elements);
export const m3MulV = (m, v) => _v.fromArray(v).applyMatrix3(_a3.set(...m)).toArray();
export const m3T = (m) => rows3(_a3.set(...m).transpose().elements);
export const m3Inv = (m) => rows3(_a3.set(...m).invert().elements);
export const m3AxisAngle = (ax, ay, az, t) =>
  rows4(_m4.makeRotationAxis(_v.set(ax, ay, az), t).elements);
export const m3Rot = (axis, t) =>
  m3AxisAngle(+(axis === "x"), +(axis === "y"), +(axis === "z"), t);

// ---- quaternion [x, y, z, w] -----------------------------------------------

export const qFromM3 = (m) =>
  _q.setFromRotationMatrix(_m4.setFromMatrix3(_a3.set(...m))).toArray();
export const qToM3 = (q) => rows4(_m4.makeRotationFromQuaternion(_q.fromArray(q)).elements);
export const qSlerp = (a, b, t) => {
  const o = [0, 0, 0, 0];
  THREE.Quaternion.slerpFlat(o, 0, a, 0, b, 0, t);
  return o;
};

// ---- easing: t in [0,1] -> eased t in [0,1] --------------------------------
// Three.js ships no easing curves.

const BACK = 1.70158;
function bounceOut(t) {
  const n = 7.5625, d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
  if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
  return n * (t -= 2.625 / d) * t + 0.984375;
}

export const eases = {
  linear: (t) => t,
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  // overshoots past 1, then settles back — the snap
  outBack: (t) => 1 + (BACK + 1) * Math.pow(t - 1, 3) + BACK * Math.pow(t - 1, 2),
  // overshoots, then rattles down onto 1 — the landing
  outBounce: bounceOut,
};

// ---- seeded PRNG -----------------------------------------------------------
// mulberry32 — stable replayable sequences. Three.js has no seeded generator.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
