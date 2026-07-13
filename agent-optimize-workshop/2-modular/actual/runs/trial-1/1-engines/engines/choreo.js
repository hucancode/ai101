// choreo — seeded procedural beat generator.
//
// Drives a set of pose channels on its own. Every frame it writes values straight
// into the caller's pose object IN PLACE, so a UI bound to that object tracks the
// motion live and a drag that overwrites a channel hands control straight back.
//
// Contract (all supplied by the caller):
//   channels : [{ key, min, max }, ...]   one entry per drivable channel
//   home     : { [key]: number }          the neutral/home value for each channel
//   seed     : integer                    same seed -> identical replayable run
//   period   : seconds between beats       (tunable live)
//   grid     : radians; targets favour multiples of this ("clean grid angles")
//
// Per beat it picks 1–3 channels and ramps each from wherever it currently sits to
// a fresh target with an overshoot-and-settle ease (outBack): the travel aims PAST
// the target then reels back exactly onto it. Targets are read LIVE (a beat starts
// from wherever the previous beat, or a drag, left the value), aim into the FAR
// half of the channel's range, and snap toward the grid. Now and then a beat snaps
// the WHOLE pose home instead.

import { eases, clamp, mulberry32 } from "../gfx.js";

const DEFAULT_PERIOD = 1.1;      // seconds per beat
const DEFAULT_GRID = Math.PI / 12; // 15° — clean grid angles
const HOME_SNAP_PROB = 0.14;     // chance a beat snaps the whole pose home
const RAMP = 0.92;               // fraction of the period a tween takes to settle
const MAX_PICK = 3;              // channels touched per ordinary beat (1..3)

// Validate loudly — a malformed channel/home is a caller bug, not something to
// paper over. Crash immediately so the fault is visible at its source.
function validate(channels, home) {
  if (!Array.isArray(channels) || channels.length === 0)
    throw new Error("choreo: `channels` must be a non-empty array");
  for (const c of channels) {
    if (!c || typeof c.key !== "string")
      throw new Error("choreo: each channel needs a string `key`");
    if (!Number.isFinite(c.min) || !Number.isFinite(c.max) || c.min >= c.max)
      throw new Error(`choreo: channel "${c.key}" needs finite min < max`);
    if (!Number.isFinite(home[c.key]))
      throw new Error(`choreo: home pose missing finite value for "${c.key}"`);
  }
}

// A grid-snapped target in the FAR half of [min,max] relative to `current`.
function pickTarget(rng, min, max, current, grid) {
  const mid = (min + max) / 2;
  // the half of the range on the opposite side of the midpoint from where we are
  const lo = current < mid ? mid : min;
  const hi = current < mid ? max : mid;
  const raw = lo + rng() * (hi - lo);
  const snapped = Math.round(raw / grid) * grid;
  return clamp(snapped, min, max);
}

/**
 * Build a choreographer. The caller advances it with dt each frame; it mutates
 * `pose` in place. Returns a small transport the demo drives.
 */
export function createChoreographer({
  channels,
  home,
  seed = 1,
  period = DEFAULT_PERIOD,
  grid = DEFAULT_GRID,
} = {}) {
  home = home || {};
  validate(channels, home);
  if (!Number.isFinite(period) || period <= 0)
    throw new Error("choreo: `period` must be a positive number");

  const byKey = new Map(channels.map((c) => [c.key, c]));
  let rng = mulberry32(seed);
  let sinceBeat = 0;                 // seconds accumulated toward the next beat
  const active = new Map();          // key -> { from, to, dur, t }

  // Start a fresh tween on `key`, reading its live current value as the origin.
  function startTween(pose, key, target, dur) {
    const from = Number.isFinite(pose[key]) ? pose[key] : home[key];
    active.set(key, { from, to: target, dur, t: 0 });
  }

  // Fire one beat: either snap the whole pose home, or drive 1..3 channels to
  // fresh far-half grid targets. Reads the pose live so drags are respected.
  function beat(pose) {
    const dur = period * RAMP;
    if (rng() < HOME_SNAP_PROB) {
      for (const c of channels) startTween(pose, c.key, home[c.key], dur);
      return;
    }
    // 1..3 distinct channels, drawn without replacement.
    const pool = channels.slice();
    const n = Math.min(1 + Math.floor(rng() * MAX_PICK), pool.length);
    for (let i = 0; i < n; i++) {
      const idx = Math.floor(rng() * pool.length);
      const c = pool.splice(idx, 1)[0];
      const cur = Number.isFinite(pose[c.key]) ? pose[c.key] : home[c.key];
      startTween(pose, c.key, pickTarget(rng, c.min, c.max, cur, grid), dur);
    }
  }

  return {
    /** Advance by dt (seconds) and write eased values into `pose` in place. */
    update(pose, dt) {
      if (!pose) throw new Error("choreo: update needs a pose object");
      if (!Number.isFinite(dt) || dt < 0)
        throw new Error("choreo: update needs a finite dt >= 0");

      sinceBeat += dt;
      // Bounded catch-up: never fire more than a handful of beats for one huge dt
      // (e.g. a backgrounded tab), so a long stall can't spin an unbounded loop.
      let guard = 8;
      while (sinceBeat >= period && guard-- > 0) {
        sinceBeat -= period;
        beat(pose);
      }
      if (guard <= 0) sinceBeat = 0; // drop the backlog rather than chase it

      for (const [key, tw] of active) {
        tw.t += dt / tw.dur;
        if (tw.t >= 1) {
          pose[key] = tw.to;         // reel back exactly onto the target
          active.delete(key);
        } else {
          // outBack overshoots past 1 then settles — travel aims PAST the target.
          const e = eases.outBack(tw.t);
          pose[key] = tw.from + (tw.to - tw.from) * e;
        }
      }
      return pose;
    },

    /** Drop any tween on `key` so a drag reclaims the channel immediately. */
    release(key) {
      if (byKey.has(key)) active.delete(key);
    },

    /** Whether any channel is currently being driven. */
    get busy() {
      return active.size > 0;
    },

    get period() {
      return period;
    },
    set period(v) {
      if (!Number.isFinite(v) || v <= 0)
        throw new Error("choreo: `period` must be a positive number");
      period = v;
    },

    /** Rewind to the seed's start: same seed replays the same run. */
    reset() {
      rng = mulberry32(seed);
      sinceBeat = 0;
      active.clear();
    },
  };
}

export default createChoreographer;
