// CHOREOGRAPHER — plans a beat every `period` seconds and plays it by
// mutating the caller's pose object in place (see PROMPT.md).
//
// A beat is either:
//   - improvised: a leading anticipation slice (1-3 SMALL, leaf-near
//     sliders ramping linearly to a fresh target) then a main move (1 BIG,
//     root-near slider — never hip/knee — travelling dead-linear PAST its
//     target, then reeled back exactly onto it with an outBounce), then a
//     rest tail holding the result.
//   - a snap-home beat: instead of improvising, every slider named in
//     `home` is snapped back to it with the outBack ease (math.js labels it
//     "the snap") over the whole period, so improvised beats never wander
//     too far from rest.
//
// Targets are captured at plan time, so a beat always starts wherever the
// last one — or the user's dragging — left off; a user drag is detected by
// noticing the pose value no longer matches what this module itself last
// wrote there, and control is handed straight back for the rest of the beat.
import { clamp, lerp, eases, mulberry32 } from "./math.js";

// every beat-shape number, named and overridable via the `timing` spread.
const DEFAULTS = {
  period: 2.4,          // seconds per beat
  anticipation: 0.25,   // fraction of the period spent on the anticipation slice
  main: 0.5,             // fraction of the period spent on the main move
  bounce: 0.4,           // closing fraction of the main move spent bouncing onto the target
  overshoot: 1.2,        // main move travel target = from + (to - from) * overshoot
  homeChance: 0.25,      // odds a beat snaps home instead of improvising
  anticipationMin: 1,    // fewest small sliders an anticipation slice fires
  anticipationMax: 3,    // most small sliders an anticipation slice fires
  gridStep: 45,          // degrees between candidate target angles
};

const EPS = 1e-4;

// draw n distinct entries from pool without replacement.
function pickN(pool, n, rng) {
  const arr = pool.slice();
  const out = [];
  const count = Math.min(n, arr.length);
  for (let i = 0; i < count; i++) {
    const j = Math.floor(rng() * arr.length);
    out.push(arr.splice(j, 1)[0]);
  }
  return out;
}

// Aim into the half of [min, max] furthest from `current`, drawn from the
// gridStep° grid inside that half (45/90/180 all land on a 45° grid) —
// `current` is never a candidate. A half too narrow for a grid point falls
// back to a raw draw inside it.
function pickTarget(rng, min, max, current, gridStep) {
  const mid = (min + max) / 2;
  const upper = current <= mid;
  const lo = upper ? mid : min;
  const hi = upper ? max : mid;
  const iStart = Math.ceil(lo / gridStep);
  const iEnd = Math.floor(hi / gridStep);
  const candidates = [];
  for (let i = iStart; i <= iEnd; i++) {
    const a = i * gridStep;
    if (Math.abs(a - current) > EPS) candidates.push(a);
  }
  if (candidates.length) return candidates[Math.floor(rng() * candidates.length)];
  return lo + rng() * (hi - lo);
}

export function createChoreographer(sliders, { home, seed = 1, ...timing } = {}) {
  const cfg = { ...DEFAULTS, ...timing };
  const rng = mulberry32(seed);
  // root-near "big" candidates for the main move, minus hip/knee (never the lead move)
  const bigPool = sliders.filter((s) => s.big && s.key !== "hip" && s.key !== "knee");
  const smallPool = sliders.filter((s) => !s.big);

  const lastWritten = {};   // key -> value this module last wrote, to detect a drag
  let beat = null;
  let elapsed = 0;

  function planBeat(pose) {
    const period = cfg.period;
    const tracks = [];
    if (rng() < cfg.homeChance) {
      for (const key of Object.keys(home))
        tracks.push({ key, from: pose[key], to: home[key], ease: eases.outBack, t0: 0, t1: period });
    } else {
      const tAnt0 = 0, tAnt1 = period * cfg.anticipation;
      const tMain0 = tAnt1, tMain1 = tAnt1 + period * cfg.main;
      const tHit = tMain0 + (tMain1 - tMain0) * (1 - cfg.bounce);

      const n = cfg.anticipationMin + Math.floor(rng() * (cfg.anticipationMax - cfg.anticipationMin + 1));
      for (const s of pickN(smallPool, n, rng)) {
        const from = pose[s.key];
        const to = pickTarget(rng, s.min, s.max, from, cfg.gridStep);
        tracks.push({ key: s.key, from, to, ease: eases.linear, t0: tAnt0, t1: tAnt1 });
      }
      if (bigPool.length) {
        const s = bigPool[Math.floor(rng() * bigPool.length)];
        const from = pose[s.key];
        const to = pickTarget(rng, s.min, s.max, from, cfg.gridStep);
        const past = to + (to - from) * (cfg.overshoot - 1);   // dead-linear travel aimed PAST the target
        tracks.push({ key: s.key, from, to: past, ease: eases.linear, t0: tMain0, t1: tHit });
        tracks.push({ key: s.key, from: past, to, ease: eases.outBounce, t0: tHit, t1: tMain1 });
      }
    }
    for (const tr of tracks) lastWritten[tr.key] = pose[tr.key];   // fresh baseline: this beat starts here
    return { period, tracks };
  }

  function applyBeat(pose) {
    for (const tr of beat.tracks) {
      if (elapsed < tr.t0) continue;
      const lw = lastWritten[tr.key];
      if (lw !== undefined && Math.abs(pose[tr.key] - lw) > EPS) continue;   // dragged away — hand stays in control
      const span = tr.t1 - tr.t0;
      const u = span > 0 ? clamp((elapsed - tr.t0) / span, 0, 1) : 1;
      const value = lerp(tr.from, tr.to, tr.ease(u));
      pose[tr.key] = value;
      lastWritten[tr.key] = value;
    }
  }

  return {
    step(dt, pose) {
      if (!beat) beat = planBeat(pose);
      elapsed += dt;
      let guard = 0;               // bounded: a stalled/huge dt must not spin forever
      while (elapsed >= beat.period && guard++ < 1000) {
        elapsed -= beat.period;
        beat = planBeat(pose);
      }
      applyBeat(pose);
    },
  };
}
