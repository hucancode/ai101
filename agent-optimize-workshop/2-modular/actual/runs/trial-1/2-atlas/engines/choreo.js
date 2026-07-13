// CHOREO ENGINE — procedural beat generator for a slider-driven rig.
//
// Every `period` seconds it plans a beat: 1-3 sliders picked at random, each tweened
// from where it sits to a fresh grid target. Now and then the whole rig snaps home.
// The beat mutates the pose object in place, so whatever binds those sliders tracks
// the motion for free; targets are captured at plan time, so a beat starts wherever
// the last one — or a drag — left off.
//
// THE BEAT IS THREE PHASES, ON TWO DIFFERENT SLIDERS — that split is the whole point:
//
//   ANTICIPATION  short   the ANTICIPATION slider leans AGAINST the coming travel and
//                         hangs there. The main sliders have not moved yet.
//   MOVE          long    the MAIN sliders travel, accelerating out of the wind-up and
//                         flying PAST their targets. The anticipation unwinds.
//   BOUNCE        short   the overshoot rattles down onto the target and stops dead,
//                         as the anticipation arrives home.
//
// The anticipation belongs to a DIFFERENT part than the one that moves. A limb that
// winds ITSELF up reads as sprung — a body that counters itself reads as having decided
// to move. Two sliders, two curve shapes, one beat.
import { mulberry32, eases, lerp } from "../gfx.js";

const PERIOD = 1.1;        // seconds between beats
const REST = 0.18;         // trailing slice, everything already settled

// the three phases, as fractions of the move. Anticipation and bounce are short; the
// MOVE is what is left, and it is the long one.
const ANTICIPATE = 0.16;
const BOUNCE = 0.26;
const MOVE = 1 - ANTICIPATE - BOUNCE;

const WIND = 0.14;         // how far BACK the anticipation leans (fraction of distance)
const OVERSHOOT = 0.3;     // how far PAST the target the move flies

const HOME_CHANCE = 0.05;  // odds a beat snaps back to the rest pose
const GRID = 45;           // machine-square target angles

// THE MAIN MOVE's curve — it HOLDS through the anticipation (another part is winding
// up on its behalf), then travels long and flies PAST the target, then rattles down
// onto it. Progress space: 0 = where it started, 1 = the target.
function mainMove(t) {
  if (t < ANTICIPATE) return 0;                                       // wait: not my phase
  if (t < ANTICIPATE + MOVE)                                          // the long travel, past
    return lerp(0, 1 + OVERSHOOT, eases.inOutCubic((t - ANTICIPATE) / MOVE));
  return lerp(1 + OVERSHOOT, 1,                                       // and settle
    eases.outBounce((t - ANTICIPATE - MOVE) / BOUNCE));
}

// THE ANTICIPATION's curve — a different part, and a different shape: it leans out
// over the anticipation phase, hangs at the top of the wind-up, then unwinds across
// the move and the bounce, arriving home just as the main move lands. 0..1 of a lean.
function anticipation(t) {
  if (t < ANTICIPATE) return eases.inOutSine(t / ANTICIPATE);         // out, and hang
  return 1 - eases.inOutCubic((t - ANTICIPATE) / (1 - ANTICIPATE));   // unwind
}

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

  // PLAN A BEAT — in the order the beat happens:
  //
  //   1. pick the MAIN sliders (1-3), aimed at fresh grid targets
  //   2. pick the ANTICIPATION slider — a DIFFERENT one, which winds up on their behalf
  //   3. the anticipation slider animates FIRST, leaning AGAINST the main travel
  //   4. the main sliders animate: the long move, flying past their targets
  //   5. the main sliders BOUNCE down onto them, as the anticipation unwinds home
  //
  // The wind-up living on another part is the whole trick: a limb that winds ITSELF up
  // reads as sprung; a body that counters itself reads as having decided to move.
  // A home-snap moves everything and anticipates with nothing.
  const plan = (pose) => {
    const snap = rnd() < HOME_CHANCE;

    // 1. the main move
    const main = snap ? sliders : sample(rnd, sliders, 1 + ((rnd() * Math.min(3, sliders.length)) | 0));
    tracks = main.map((s) => ({
      key: s.key, curve: mainMove,
      from: pose[s.key],
      to: snap ? (home[s.key] ?? pose[s.key]) : target(rnd, pose[s.key], s.min, s.max),
    }));
    if (snap) return PERIOD;

    // 2. the anticipation, on a slider the main move is NOT using
    const others = sliders.filter((s) => !main.some((m) => m.key === s.key));
    if (!others.length) return PERIOD;
    const a = sample(rnd, others, 1)[0];
    const against = -(Math.sign(tracks[0].to - tracks[0].from) || 1);
    const from = pose[a.key];
    const lean = from + against * WIND * (a.max - a.min);
    tracks.push({
      key: a.key, curve: anticipation, from,
      to: Math.max(a.min, Math.min(a.max, lean)),      // a wind-up never leaves its range
    });
    return PERIOD;
  };

  return {
    /** advance the beat and write the rig pose in place */
    step(dt, pose) {
      clock += dt;
      if (clock >= span) { clock -= span; span = plan(pose); }
      const u = Math.min(1, clock / dur);
      for (const t of tracks)
        pose[t.key] = u >= 1 && t.curve === mainMove ? t.to : lerp(t.from, t.to, t.curve(u));
    },
  };
}
