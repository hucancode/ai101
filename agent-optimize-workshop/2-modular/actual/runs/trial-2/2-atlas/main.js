// Shared engine demo page.
//
// SHARED FILE — three engines wire into it. Keep additions ADDITIVE.
//
// Contract for an engine that wants tabs here: export from your engine module
// either `subjects` (an array) or `registerSubjects(add)`, where each subject is
//
//   { kind, name, build(scene) -> { channels, pose, caption?, update?(), dispose?() } }
//
//   kind      groups the tabs in the tab bar ("skeleton", "prop", ...)
//   channels  [{ key, min, max, grid? }]  — the sliders the panel builds
//   pose      { key: number }             — MUTATED IN PLACE by sliders + choreo
//   update()  optional per-frame hook: read `pose`, drive your scene graph
//
//   choreoChannels  optional subset of `channels` the choreographer may drive. Every
//                   channel still gets a slider; the ones left out are hand-only (atlas
//                   keeps its legs out of the beat — they are holding the mech up).
//
// The loader below picks those up if the module exists, so the page runs with
// whichever engines have landed.

import { createViewer, THREE } from "./gfx.js";
import { createChoreographer } from "./engines/choreo.js"; // choreo engine

// ---- subject registry ------------------------------------------------------

const SUBJECTS = [];
const addSubject = (s) => SUBJECTS.push(s);

for (const path of ["./demo-shapes.js", "./demo-joints.js", "./engines/modeling.js", "./engines/joint.js", "./atlas.js"]) {
  try {
    const mod = await import(path);
    if (Array.isArray(mod.subjects)) mod.subjects.forEach(addSubject);
    else if (typeof mod.registerSubjects === "function") mod.registerSubjects(addSubject);
  } catch (e) {
    console.info(`[demo] ${path} not wired in yet:`, e.message);
  }
}

// Fallback subject, ONLY when no engine has registered one — so the page is never
// empty while the other engines are still landing. It disappears the moment a real
// subject exists.
if (SUBJECTS.length === 0) SUBJECTS.push(placeholderSubject());

function placeholderSubject() {
  return {
    kind: "placeholder",
    name: "test arm",
    build(scene) {
      const root = new THREE.Group();
      const mat = new THREE.MeshPhongMaterial({ color: 0x7dcb2f, shininess: 60 });
      const seg = (len) => {
        const g = new THREE.Group();
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.35, len, 0.35), mat);
        m.position.y = len / 2;
        g.add(m);
        return g;
      };
      const a = seg(1.4);
      const b = seg(1.2);
      const c = seg(0.8);
      b.position.y = 1.4;
      c.position.y = 1.2;
      a.add(b);
      b.add(c);
      root.add(a);
      scene.add(root);

      const pose = { base: 0, shoulder: 0.3, elbow: 0.6, wrist: 0 };
      return {
        channels: [
          { key: "base", min: -Math.PI, max: Math.PI },
          { key: "shoulder", min: -1.4, max: 1.4 },
          { key: "elbow", min: -0.2, max: 2.4 },
          { key: "wrist", min: -1.2, max: 1.2 },
        ],
        pose,
        caption: "placeholder arm — a rig for the choreographer to drive until the modeling and joint engines land.",
        update() {
          root.rotation.y = pose.base;
          a.rotation.z = pose.shoulder;
          b.rotation.z = pose.elbow;
          c.rotation.z = pose.wrist;
        },
        dispose() {
          scene.remove(root);
        },
      };
    },
  };
}

// ---- viewer ----------------------------------------------------------------

const viewer = createViewer(document.getElementById("view"), { camDist: 7, camHeight: 1.5 });

// ---- tab bar, grouped by subject kind ---------------------------------------

const tabsEl = document.getElementById("tabs");
const captionEl = document.getElementById("caption");
const slidersEl = document.getElementById("sliders");

let active = null; // { subject, built, choreo, rows }
const tabButtons = new Map();

const kinds = [...new Set(SUBJECTS.map((s) => s.kind ?? "subject"))];
for (const kind of kinds) {
  const group = document.createElement("div");
  group.className = "tab-group";
  const label = document.createElement("span");
  label.className = "kind";
  label.textContent = kind;
  group.appendChild(label);
  for (const s of SUBJECTS.filter((x) => (x.kind ?? "subject") === kind)) {
    const b = document.createElement("button");
    b.textContent = s.name;
    b.onclick = () => select(s);
    group.appendChild(b);
    tabButtons.set(s, b);
  }
  tabsEl.appendChild(group);
}

// ---- choreo engine: play/pause transport over the ACTIVE subject's sliders ----

const playBtn = document.getElementById("play");
const periodEl = document.getElementById("period");
const beatEl = document.getElementById("beat");
let playing = false;

playBtn.onclick = () => {
  playing = !playing;
  playBtn.textContent = playing ? "pause" : "play";
  playBtn.classList.toggle("on", playing);
};
periodEl.oninput = () => {
  if (active?.choreo) active.choreo.period = +periodEl.value;
};

// ---- slider panel, rebuilt per subject ---------------------------------------

function select(subject) {
  if (active) {
    active.built.dispose?.();
    tabButtons.get(active.subject)?.classList.remove("on");
  }
  const built = subject.build(viewer.scene);
  tabButtons.get(subject)?.classList.add("on");

  // The choreographer drives THIS subject's channels, writing into THIS subject's
  // pose object — the same object the sliders read and write. Nothing else is needed
  // to make the sliders track the motion. A subject may hold some channels back from
  // the beat (`choreoChannels`); those still get a slider, they just never get driven.
  const driveable = built.choreoChannels ?? built.channels;
  const drivenKeys = new Set(driveable.map((c) => c.key));
  const choreo = createChoreographer({
    channels: driveable,
    pose: built.pose,
    home: { ...built.pose },
    seed: 1,
    period: +periodEl.value,
  });

  slidersEl.textContent = "";
  const rows = built.channels.map((c) => {
    const row = document.createElement("div");
    row.className = "row";
    const label = document.createElement("label");
    const name = document.createElement("span");
    name.textContent = c.key;
    const val = document.createElement("span");
    val.className = "val";
    label.append(name, val);

    const input = document.createElement("input");
    input.type = "range";
    input.min = c.min;
    input.max = c.max;
    input.step = (c.max - c.min) / 1000;
    input.value = built.pose[c.key];

    // A DRAG RECLAIMS THE CHANNEL: the hand writes the pose, the choreographer stops
    // writing that channel for the rest of the beat, and its next beat re-reads the
    // pose live — so the motion departs from where the hand left it. A hand-only
    // channel has nothing to reclaim it from; it is simply written.
    const reclaim = () => { if (drivenKeys.has(c.key)) choreo.reclaim(c.key); };
    let held = false;
    input.addEventListener("pointerdown", () => {
      held = true;
      reclaim();
    });
    const release = () => (held = false);
    input.addEventListener("pointerup", release);
    input.addEventListener("pointercancel", release);
    input.addEventListener("blur", release);
    input.addEventListener("input", () => {
      reclaim();
      built.pose[c.key] = +input.value;
    });

    row.append(label, input);
    slidersEl.appendChild(row);
    return { c, input, val, row, isHeld: () => held };
  });

  captionEl.textContent = built.caption ?? subject.name;
  active = { subject, built, choreo, rows };
}

select(SUBJECTS[0]);

// ---- frame -----------------------------------------------------------------

let last = 0;
viewer.onFrame = (t) => {
  const dt = Math.min(0.05, t - last); // clamp: a backgrounded tab must not teleport
  last = t;
  if (!active) return;
  const { choreo, built, rows } = active;

  if (playing) choreo.update(dt);

  // the pose is the single source of truth; sliders and rig both read it
  const st = choreo.state;
  const driven = new Set(playing ? st.mains.concat(st.anticipation ?? []) : []);
  for (const r of rows) {
    if (!r.isHeld()) r.input.value = built.pose[r.c.key];
    r.val.textContent = built.pose[r.c.key].toFixed(2);
    r.row.classList.toggle("driven", driven.has(r.c.key));
  }
  beatEl.textContent = playing
    ? `beat ${st.beat} · ${st.isHome ? "home" : st.phase}`
    : "idle";

  built.update?.();
};
