// CHOREO ENGINE — procedural beat generator for a slider-driven rig.
//
// Every `period` seconds it plans a beat: 1-3 sliders picked at random, each tweened
// from where it sits to a fresh grid target with a move-hit ease — a dead-linear
// travel aimed PAST the target, then a bounce that reels it back onto it. Now and
// then the whole rig snaps home. The beat mutates the pose object in place, so
// whatever binds those sliders tracks the motion for free; targets are captured at
// plan time, so a beat starts wherever the last one — or a drag — left off.
import { mulberry32, eases, lerp } from "../gfx.js";

const PERIOD = 1;          // seconds between beats
const REST = 0.2;          // trailing slice, everything already settled
const BOUNCE_TIME = 0.3;   // closing slice of the move the bounce occupies
const BOUNCE_POWER = 0.35; // how far the travel aims past the target (fraction of distance)
const HOME_CHANCE = 0.05;  // odds a beat snaps back to the rest pose
const GRID = 45;           // machine-square target angles

// an ease that leaves [0,1] on the way: constant speed out past the target, then
// outBounce hauls it back to exactly 1
const hit = (t) =>
  t < 1 - BOUNCE_TIME
    ? ((1 + BOUNCE_POWER) * t) / (1 - BOUNCE_TIME)
    : lerp(1 + BOUNCE_POWER, 1, eases.outBounce((t - (1 - BOUNCE_TIME)) / BOUNCE_TIME));

// Aim into the half of the range furthest from where the slider sits, and draw from
// the grid inside that half (current angle excluded); a too-narrow half draws raw.
function target(rnd, from, min, max) {
  const mid = (min + max) / 2;
  const [lo, hi] = from < mid ? [mid, max] : [min, mid];
  const grid = [];
  for (let g = Math.ceil(lo / GRID) * GRID; g <= hi; g += GRID) if (g !== from) grid.push(g);
  return grid.length ? grid[(rnd() * grid.length) | 0] : lerp(lo, hi, rnd());
}

// Fisher-Yates prefix: `n` distinct entries out of the pool.
function sample(rnd, pool, n) {
  const a = [...pool];
  for (let i = 0; i < n; i++) {
    const j = i + ((rnd() * (a.length - i)) | 0);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

/**
 * @param sliders  [{ key, min, max }]
 * @param home     rest pose the rig occasionally snaps back to
 */
export function createChoreographer(sliders, { home = {}, seed = 1 } = {}) {
  const rnd = mulberry32(seed);
  const dur = (1 - REST) * PERIOD;
  let clock = 0, span = 0, tracks = [];

  // plan a beat: a home-snap, or 1-3 sliders each aimed at a fresh grid target
  const plan = (pose) => {
    const snap = rnd() < HOME_CHANCE;
    const picks = snap ? sliders : sample(rnd, sliders, 1 + ((rnd() * Math.min(3, sliders.length)) | 0));
    tracks = picks.map((s) => ({
      key: s.key,
      from: pose[s.key],
      to: snap ? (home[s.key] ?? pose[s.key]) : target(rnd, pose[s.key], s.min, s.max),
    }));
    return PERIOD;
  };

  return {
    /** advance the beat and write the rig pose in place */
    step(dt, pose) {
      clock += dt;
      if (clock >= span) { clock -= span; span = plan(pose); }
      const u = Math.min(1, clock / dur);
      for (const t of tracks) pose[t.key] = u >= 1 ? t.to : lerp(t.from, t.to, hit(u));
    },
  };
}
