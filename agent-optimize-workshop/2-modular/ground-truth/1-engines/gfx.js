import * as THREE from "./three.module.min.js";

// The ONLY module that touches the raw Three build. The modeling engine builds its
// meshes from THREE via this re-export, so the raw dependency stays centralised.
export { THREE };

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
export const HPI = Math.PI / 2;
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
// rotation (row-major 3x3) mapping +Y onto unit dir `d`
export function alignY(d) {
  const v = vNorm(d);
  const axis = vCross([0, 1, 0], v);
  const s = Math.hypot(axis[0], axis[1], axis[2]);
  if (s < 1e-6) return v[1] >= 0 ? I3 : [1, 0, 0, 0, -1, 0, 0, 0, -1];
  return m3AxisAngle(axis[0] / s, axis[1] / s, axis[2] / s, Math.acos(clamp(v[1], -1, 1)));
}

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

// ---- identity coloring -----------------------------------------------------
// color = palette[hash(id, seed)]: pieces sharing an id get the SAME color (lego),
// a new seed remaps them but keeps that property. A string-hash into a palette —
// pure math, so it lives with the rest of it.
const PALETTE = [
  "#c0392b", "#e67e22", "#f1c40f", "#7dcb2f", "#27ae60", "#1abc9c",
  "#3498db", "#2c5aa0", "#8e44ad", "#d354a4", "#c8a165", "#8d6e63",
  "#95a5a6", "#5d6d7e", "#e8e4d8", "#37474f",
].map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255));

export function colorOf(id, seed = 1) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < (id = id || "anon").length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  return PALETTE[((h ^ Math.imul(seed, 0x9e3779b1)) >>> 0) % PALETTE.length];
}
// memoised colorOf for a rig that re-colors the same ids every frame
export function colorMemo(seed) {
  const cache = new Map();
  return (id) => cache.get(id) ?? cache.set(id, colorOf(id, seed)).get(id);
}

// ---- viewer ----------------------------------------------------------------
// scene + camera + lights + orbit (drag = rotate, wheel = zoom) +
// requestAnimationFrame loop. `onFrame(t)` gets seconds since start.

export function createViewer(canvas, { camDist = 6, camHeight = 2, target = [0, 0, 0] } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x11141a);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 200);
  const tgt = new THREE.Vector3(...target);

  scene.add(new THREE.AmbientLight(0xffffff, 0.45));
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(4, 8, 6);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x8899bb, 0.5);
  fill.position.set(-5, 2, -4);
  scene.add(fill);

  scene.add(new THREE.GridHelper(10, 10, 0x334, 0x223));

  // orbit state
  let yaw = 0.6, pitch = 0.35, dist = camDist;
  let dragging = false, px = 0, py = 0;
  canvas.addEventListener("pointerdown", (e) => { dragging = true; px = e.clientX; py = e.clientY; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener("pointerup", () => (dragging = false));
  canvas.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    yaw -= (e.clientX - px) * 0.005;
    pitch = Math.max(-1.4, Math.min(1.4, pitch + (e.clientY - py) * 0.005));
    px = e.clientX; py = e.clientY;
  });
  canvas.addEventListener("wheel", (e) => { e.preventDefault(); dist = Math.max(0.5, Math.min(80, dist * Math.exp(e.deltaY * 0.001))); }, { passive: false });

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== w * devicePixelRatio || canvas.height !== h * devicePixelRatio) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
  }

  let onFrame = null;
  const t0 = performance.now();
  function loop() {
    resize();
    camera.position.set(
      tgt.x + dist * Math.cos(pitch) * Math.sin(yaw),
      tgt.y + camHeight + dist * Math.sin(pitch),
      tgt.z + dist * Math.cos(pitch) * Math.cos(yaw),
    );
    camera.lookAt(tgt);
    if (onFrame) onFrame((performance.now() - t0) / 1000);
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  return { scene, camera, renderer, set onFrame(fn) { onFrame = fn; } };
}

// ---- mesh transforms -------------------------------------------------------
// LEFT-multiply a mesh's own matrix (compose in world order); no vertex work — the
// shared geometry is untouched. A builder chains these to place a piece.
const _tf = new THREE.Matrix4();
export const translate = (g, x, y, z) => (g.matrix.premultiply(_tf.makeTranslation(x, y, z)), g);
export const rotX = (g, r) => (g.matrix.premultiply(_tf.makeRotationX(r)), g);
export const rotY = (g, r) => (g.matrix.premultiply(_tf.makeRotationY(r)), g);
export const rotZ = (g, r) => (g.matrix.premultiply(_tf.makeRotationZ(r)), g);
export const applyM = (g, m) => (g.matrix.premultiply(m), g);

// a Group carrying a rigid matrix (the static rest of a bone); its child stays free
// to be posed
export function frameNode(parent, m) {
  const n = new THREE.Group();
  m.decompose(n.position, n.quaternion, n.scale);
  if (parent) parent.add(n);
  return n;
}

// GPU geometry built once per source unit-mesh OBJECT: every mesh instance sharing
// one unit mesh (same `key`) shares one buffer. The modeling engine calls this to
// back the THREE.Mesh it hands out.
const _geoCache = new WeakMap();
export function geometryOf(src) {
  let g = _geoCache.get(src);
  if (!g) {
    g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(src.positions, 3));
    g.setAttribute("normal", new THREE.BufferAttribute(src.normals, 3));
    _geoCache.set(src, g);
  }
  return g;
}

// ---- scene-graph helpers ---------------------------------------------------
// Thin Three wrappers for building a posable graph: parented Group nodes, unit-
// mesh instances hung on them, and a floor-drop. Three composes the world
// transforms and renders the graph — a caller poses a node by setting its
// rotation, so there is no bone math to hand-roll and no per-frame item baking.

const _matCache = new Map();       // "r,g,b" -> MeshPhongMaterial
const _tmp4 = new THREE.Matrix4();

function materialOf(c = [0.7, 0.72, 0.75]) {
  const k = `${c[0]},${c[1]},${c[2]}`;
  let m = _matCache.get(k);
  if (!m) _matCache.set(k, (m = new THREE.MeshPhongMaterial({
    shininess: 60, color: new THREE.Color(c[0], c[1], c[2]),
  })));
  return m;
}

// a child Group at `offset` in `parent` (null parent = a root). With a fixed REST
// rotation, a hidden wrapper carries offset+rest so the returned node's rotation
// stays free for posing without clobbering the rest. `parent` null builds a root.
export function group(parent, offset = [0, 0, 0], rest = null) {
  let host = parent;
  if (rest) {
    const w = new THREE.Group();
    w.position.set(offset[0], offset[1], offset[2]);
    w.quaternion.copy(_q.fromArray(qFromM3(rest)));
    if (parent) parent.add(w);
    host = w; offset = [0, 0, 0];
  }
  const n = new THREE.Group();
  n.position.set(offset[0], offset[1], offset[2]);
  if (host) host.add(n);
  return n;
}

// hang a modeling mesh on a node: colour it and (optionally) shift it in the node's
// frame. The mesh already carries its own local matrix, so we only left-add offset.
export function attachMesh(node, mesh, color, offset = [0, 0, 0]) {
  mesh.material = materialOf(color);
  mesh.matrixAutoUpdate = false;
  if (offset[0] || offset[1] || offset[2])
    mesh.matrix.premultiply(_tmp4.makeTranslation(offset[0], offset[1], offset[2]));
  node.add(mesh);
  return mesh;
}

// remove the meshes hung on a node (leaving child nodes) — for a live-rebuilt part
export function clearMeshes(node) {
  for (let i = node.children.length - 1; i >= 0; i--)
    if (node.children[i].isMesh) node.remove(node.children[i]);
}

// drop `root` so its lowest vertex sits on y=0
export function groundY(root) {
  root.updateMatrixWorld(true);
  root.position.y -= new THREE.Box3().setFromObject(root).min.y;
  root.updateMatrixWorld(true);
}
