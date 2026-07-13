// Minimal Three.js render harness for the workshop. Every item becomes a
// plain THREE.Mesh, pooled and reused across frames; GPU geometry is cached
// per source mesh object.
//
// Data contract (produced by the ground-truth code of every problem):
//   items: [{ mesh: { positions: Float32Array, normals: Float32Array },
//             m: [9 numbers, row-major 3x3], t: [x,y,z],
//             color?: [r,g,b] 0..1, a?: alpha 0..1 }]
import * as THREE from "./three.module.min.js";

// viewer: scene + camera + lights + orbit (drag = rotate, wheel = zoom) +
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

// drawer: call draw(items) every frame (or once for a static scene).
// One THREE.Mesh per item, pooled; GPU geometry built once per source mesh
// object (items sharing one mesh object share one buffer).
export function createDrawer(scene) {
  const geoCache = new WeakMap(); // source mesh -> THREE.BufferGeometry
  const pool = [];                // reusable THREE.Mesh objects
  const mat4 = new THREE.Matrix4();

  function geometryOf(src) {
    let g = geoCache.get(src);
    if (!g) {
      g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(src.positions, 3));
      g.setAttribute("normal", new THREE.BufferAttribute(src.normals, 3));
      geoCache.set(src, g);
    }
    return g;
  }

  function draw(items) {
    while (pool.length < items.length) {
      const mesh = new THREE.Mesh(undefined, new THREE.MeshPhongMaterial({ shininess: 60 }));
      mesh.matrixAutoUpdate = false;
      pool.push(mesh);
      scene.add(mesh);
    }
    for (let i = 0; i < items.length; i++) {
      const it = items[i], mesh = pool[i];
      mesh.geometry = geometryOf(it.mesh);
      const m = it.m, t = it.t;
      mat4.set(
        m[0], m[1], m[2], t[0],
        m[3], m[4], m[5], t[1],
        m[6], m[7], m[8], t[2],
        0, 0, 0, 1,
      );
      mesh.matrix.copy(mat4);
      const c = it.color ?? [0.7, 0.72, 0.75];
      mesh.material.color.setRGB(c[0], c[1], c[2]);
      const a = it.a ?? 1;
      mesh.material.transparent = a < 1;
      mesh.material.opacity = a;
      mesh.visible = a > 0.003;
    }
    for (let i = items.length; i < pool.length; i++) pool[i].visible = false;
  }

  return { draw };
}
