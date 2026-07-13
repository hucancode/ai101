// Shared engine demo — orbit viewer, tab bar grouped by subject kind, a slider
// panel rebuilt per subject, a caption, and a play/pause transport.
//
// This page is SHARED by several engine builders. Each engine registers the
// subjects it wants to show; the page below just displays whatever is registered
// and drives the active one. If you add an engine here, MERGE: keep every other
// engine's registration and wiring intact.
//
// ── Subject contract ────────────────────────────────────────────────────────
// An engine registers a subject with `registerSubject({ ... })`:
//   kind     : string   — tab-bar group ("skeleton", "part", …)
//   name     : string   — tab label (unique within its kind)
//   caption  : string?  — shown at the bottom when this subject is active
//   channels : [{ key, min, max, label?, step? }]   — the drivable pose channels
//   pose     : { [key]: number }   — the LIVE pose object, mutated in place
//   home     : { [key]: number }?  — neutral pose (defaults to a snapshot of pose)
//   seed     : integer?            — replay seed for the choreographer
//   build(scene) -> THREE.Object3D — add the subject to the scene, return its root
//   apply(pose)                    — push the pose object onto the built model
//   dispose(scene, root)?          — remove the subject from the scene
//
// registerSubject may be called before OR after this module loads: engines push
// onto window.__demoSubjects and/or call window.registerSubject.

import { createViewer } from "./gfx.js";
import { createChoreographer } from "./engines/choreo.js";

const els = {
  tabs: document.getElementById("tabs"),
  sliders: document.getElementById("sliders"),
  title: document.getElementById("panelTitle"),
  caption: document.getElementById("caption"),
  play: document.getElementById("playToggle"),
  period: document.getElementById("period"),
};

const viewer = createViewer(document.getElementById("view"), { camDist: 7, camHeight: 1.5 });

// ── subject registry ────────────────────────────────────────────────────────
const subjects = (window.__demoSubjects = window.__demoSubjects || []);
let active = null;      // { subject, root }
let choreo = null;      // choreographer bound to the active subject
let playing = false;

window.registerSubject = function registerSubject(subject) {
  subjects.push(subject);
  rebuildTabs();
  if (!active) selectSubject(subject);      // show the first one that arrives
  return subject;
};

function rebuildTabs() {
  els.tabs.textContent = "";
  const byKind = new Map();
  for (const s of subjects) {
    if (!byKind.has(s.kind)) byKind.set(s.kind, []);
    byKind.get(s.kind).push(s);
  }
  for (const [kind, list] of byKind) {
    const group = document.createElement("div");
    group.className = "group";
    const label = document.createElement("span");
    label.className = "kind";
    label.textContent = kind;
    group.appendChild(label);
    for (const s of list) {
      const b = document.createElement("button");
      b.className = "tab" + (active && active.subject === s ? " active" : "");
      b.textContent = s.name;
      b.addEventListener("click", () => selectSubject(s));
      group.appendChild(b);
    }
    els.tabs.appendChild(group);
  }
}

function selectSubject(subject) {
  if (active && active.subject === subject) return;
  setPlaying(false);
  if (active && active.subject.dispose) active.subject.dispose(viewer.scene, active.root);

  const root = subject.build(viewer.scene);
  active = { subject, root };
  choreo = null;

  els.title.textContent = subject.name;
  els.caption.textContent = subject.caption || subject.name;
  buildSliders(subject);
  rebuildTabs();
}

// ── slider panel (rebuilt per subject) ──────────────────────────────────────
const sliderEls = new Map();   // key -> { input, val }

function buildSliders(subject) {
  els.sliders.textContent = "";
  sliderEls.clear();
  for (const ch of subject.channels) {
    const wrap = document.createElement("div");
    wrap.className = "slider";
    const lab = document.createElement("label");
    const name = document.createElement("span");
    name.textContent = ch.label || ch.key;
    const val = document.createElement("span");
    val.className = "val";
    lab.append(name, val);

    const input = document.createElement("input");
    input.type = "range";
    input.min = ch.min;
    input.max = ch.max;
    input.step = ch.step != null ? ch.step : (ch.max - ch.min) / 200;
    input.value = subject.pose[ch.key] ?? 0;

    // A drag reclaims the channel: write the pose live, apply, and tell the
    // choreographer to let go of this channel so it stops fighting the user.
    input.addEventListener("input", () => {
      subject.pose[ch.key] = parseFloat(input.value);
      if (choreo) choreo.release(ch.key);
      subject.apply(subject.pose);
      val.textContent = fmt(subject.pose[ch.key]);
    });

    wrap.append(lab, input);
    els.sliders.appendChild(wrap);
    sliderEls.set(ch.key, { input, val });
    val.textContent = fmt(subject.pose[ch.key] ?? 0);
  }
}

const fmt = (x) => (typeof x === "number" ? x.toFixed(2) : "—");

// Push the live pose back onto the sliders so they track the choreographer.
function syncSliders(pose) {
  for (const [key, { input, val }] of sliderEls) {
    if (input === document.activeElement) continue; // don't fight a live drag
    const v = pose[key];
    if (typeof v !== "number") continue;
    input.value = v;
    val.textContent = fmt(v);
  }
}

// ── play / pause transport ──────────────────────────────────────────────────
function ensureChoreo() {
  const s = active.subject;
  const home = s.home || Object.fromEntries(s.channels.map((c) => [c.key, s.pose[c.key] ?? 0]));
  choreo = createChoreographer({
    channels: s.channels.map((c) => ({ key: c.key, min: c.min, max: c.max })),
    home,
    seed: s.seed ?? 1,
    period: parseFloat(els.period.value),
  });
}

function setPlaying(on) {
  playing = on && !!active;
  els.play.textContent = playing ? "pause" : "play";
  els.play.classList.toggle("on", playing);
  if (playing && !choreo) ensureChoreo();
}

els.play.addEventListener("click", () => setPlaying(!playing));
els.period.addEventListener("input", () => {
  if (choreo) choreo.period = parseFloat(els.period.value);
});

// ── frame loop ──────────────────────────────────────────────────────────────
let lastT = null;
viewer.onFrame = (t) => {
  const dt = lastT == null ? 0 : Math.min(0.1, t - lastT);
  lastT = t;
  if (!active) return;
  if (playing && choreo) {
    choreo.update(active.subject.pose, dt);
    active.subject.apply(active.subject.pose);
    syncSliders(active.subject.pose);
  }
};

// pick up any subjects registered before this module finished loading
if (subjects.length) {
  rebuildTabs();
  selectSubject(subjects[0]);
}
