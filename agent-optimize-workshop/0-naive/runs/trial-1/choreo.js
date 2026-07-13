// choreo.js — the performance: strike a new pose on every beat, and never stop
// breathing between beats.
//
// Per frame:
//   1. pick the beat's target pose (seeded, so a seed replays exactly)
//   2. blend previous -> target with a snappy ease over the first part of the beat
//   3. add continuous overlays (breath, sway, head bob, knee dip) on top
//   4. write the result into the joint rotations, hop the carrier, re-ground the
//      root so the soles stay on y = 0

import { eases, mulberry32, groundY, lerp, clamp, TAU, rad } from "./gfx.js";
import { JOINTS } from "./rig.js";
import { POSE_NAMES, poseRad } from "./poses.js";

const ZERO = [0, 0, 0];

// A dance step: how long the snap takes as a fraction of the beat, and how it eases.
const STEPS = [
  { hold: 0.45, ease: "outBack" },
  { hold: 0.60, ease: "outBack" },
  { hold: 0.35, ease: "outBounce" },
  { hold: 0.75, ease: "inOutCubic" },
];

export function createChoreo(rig, opts = {}) {
  const cfg = {
    seed: 1,
    bpm: 60,          // "about one pose per second"
    energy: 1,        // overlay + snap amplitude
    paused: false,
    ...opts,
  };

  const rnd = mulberry32(cfg.seed);
  let beat = 0;                 // beats elapsed (fractional)
  let prev = "stand";
  let cur = POSE_NAMES[(rnd() * POSE_NAMES.length) | 0];
  let step = STEPS[0];
  let last = -1;                // last frame's t, for dt
  let hop = 0;

  // Scratch euler, reused every frame for every joint: no per-frame allocation
  // in the hot path.
  const e = [0, 0, 0];

  function nextPose() {
    // never repeat the pose we are already in — a repeat reads as a dropped beat.
    // Bounded retry (POSE_NAMES.length attempts is more than enough for a
    // uniform draw over >2 names); after that, take the neighbour.
    let name = cur;
    for (let i = 0; i < POSE_NAMES.length && name === cur; i++) {
      name = POSE_NAMES[(rnd() * POSE_NAMES.length) | 0];
    }
    if (name === cur) name = POSE_NAMES[(POSE_NAMES.indexOf(cur) + 1) % POSE_NAMES.length];
    return name;
  }

  function update(t) {
    const dt = last < 0 ? 0 : clamp(t - last, 0, 0.1); // clamp: a tab-switch must not skip 40 beats
    last = t;
    if (cfg.paused) return;

    const before = Math.floor(beat);
    beat += (dt * cfg.bpm) / 60;
    if (Math.floor(beat) !== before) {
      prev = cur;
      cur = nextPose();
      step = STEPS[(rnd() * STEPS.length) | 0];
      hop = 1; // fresh landing impulse
    }

    const phase = beat - Math.floor(beat);           // 0..1 within the beat
    const k = clamp(phase / step.hold, 0, 1);        // 0..1 across the snap
    const w = eases[step.ease](k);                   // may overshoot past 1 — that is the snap

    const A = cfg.energy;
    const pA = poseRad(prev), pB = poseRad(cur);

    // continuous overlays — the robot is never frozen, even mid-hold
    const bpmScale = cfg.bpm / 60;
    const breathe = Math.sin(t * 1.8) * rad(1.6) * A;
    const sway = Math.sin(beat * Math.PI) * rad(3.5) * A;       // one sway per beat
    const bob = Math.sin(beat * TAU) * rad(2.2) * A;
    const settle = (1 - eases.outBounce(clamp(phase / 0.5, 0, 1))) * A;

    for (const j of JOINTS) {
      const a = pA[j] || ZERO;
      const b = pB[j] || ZERO;
      e[0] = lerp(a[0], b[0], w);
      e[1] = lerp(a[1], b[1], w);
      e[2] = lerp(a[2], b[2], w);

      switch (j) {
        case "pelvis": e[1] += sway * 0.6; e[2] += sway * 0.8; break;
        case "torso": e[0] += breathe + settle * rad(3); e[2] -= sway * 0.5; break;
        case "neck": e[0] += bob * 0.8 - settle * rad(4); e[1] += sway * 0.7; break;
        case "shoulderL": e[2] += bob * 0.9; break;
        case "shoulderR": e[2] -= bob * 0.9; break;
        case "elbowL": case "elbowR": e[0] -= Math.abs(bob) * 0.8; break;
        case "kneeL": case "kneeR": e[0] += settle * rad(7) + Math.abs(bob) * 0.5; break;
        default: break;
      }
      rig.joints[j].rotation.set(e[0], e[1], e[2]);
    }

    // Grounding, then the hop — and the order is load-bearing. groundY() works in
    // WORLD space, so it would happily absorb the carrier's hop into root.y and
    // leave the figure sinking below the floor as the hop decays. Zero the carrier
    // and flush the world matrices first, so groundY lands the lowest sole exactly
    // on y = 0; only then lift the whole figure by the hop, which is >= 0 always.
    rig.carrier.position.y = 0;
    rig.carrier.updateMatrixWorld(true);
    groundY(rig.root);

    hop = Math.max(0, hop - dt * 6 * bpmScale);   // ~1/6 s at 60 bpm, beat-scaled
    rig.carrier.position.y = hop * hop * 0.035 * A;
  }

  return {
    update,
    cfg,
    get pose() { return cur; },
    get beat() { return Math.floor(beat); },
  };
}
