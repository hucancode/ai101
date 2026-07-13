// choreo engine — procedural beat generator.
//
// Pure: it knows nothing about meshes, rigs or the DOM. It owns a set of pose
// CHANNELS (a key + a range) and a POSE OBJECT, and every frame it writes channel
// values into that pose object IN PLACE. Whatever is bound to the pose (a slider, a
// rig) therefore tracks the motion for free, and a hand that drags a channel hands
// control straight back: the next beat re-reads the pose LIVE and departs from
// wherever the hand left it.
//
// The beat is always the same three-act routine:
//
//   phase        length   main sliders                    anticipation slider
//   ---------------------------------------------------------------------------
//   anticipation short    hold still                      lean AGAINST the travel,
//                                                         then hang there
//   move         LONG     accelerate out, fly PAST target unwind
//   bounce       short    rattle down onto target, stop   arrive home as they land
//
// The wind-up deliberately belongs to a DIFFERENT channel than the one that moves.
// The two are different shapes over different spans, not one curve with a sign flip:
//   - main: start -> peak (past the target) -> outBounce down onto the target,
//           spanning [anticipation .. end]
//   - anticipation: a0 -> lean -> hang -> unwind back to a0, spanning the WHOLE beat
//
// Every write is clamped to the channel's range: a wind-up can never throw a channel
// out of bounds.

import { clamp, eases, mulberry32 } from "../gfx.js";

// Phase split of one beat, as fractions of the period. The move is the long one.
const PHASE_ANTICIPATE = 0.18;
const PHASE_MOVE = 0.6;
const PHASE_BOUNCE = 0.22;
const T_MOVE = PHASE_ANTICIPATE; // u where the anticipation ends / the move begins
const T_BOUNCE = PHASE_ANTICIPATE + PHASE_MOVE; // u where the bounce begins

// Within the anticipation phase, the lean is reached at this fraction and HANGS for
// the rest of it.
const LEAN_REACHED_AT = 0.6;

// A beat's target must leave this much of the range as headroom past it, so the move
// has somewhere to overshoot INTO without leaving the channel's range.
const TARGET_MARGIN = 0.1;
// Overshoot = this fraction of the travel, capped by the headroom above.
const OVERSHOOT = 0.18;
// A beat whose travel would be shorter than this (of the range) is not worth watching;
// the target is pushed out to the far end instead.
const MIN_TRAVEL = 0.05;
// Wind-up size, as a fraction of the anticipating channel's OWN range.
const LEAN_MIN = 0.12;
const LEAN_SPAN = 0.2;
// An anticipation candidate needs at least this much room in the against-direction to
// read as a wind-up; candidates are tried in a seeded shuffle until one has it.
const LEAN_ROOM = 0.05;
// Chance a beat snaps the whole pose home instead (and anticipates with nothing).
const HOME_CHANCE = 0.15;
// Grid: targets favour clean angles — multiples of range/8 (22.5 deg over a 180 deg
// channel). A channel may override with its own `grid` step.
const GRID_DIVISIONS = 8;
const GRID_CHANCE = 0.75;
// A single update() may not chew through more than this many beats, however large the
// dt handed to it (a tab that was backgrounded for a minute must not stall the frame).
// Beats are re-planned, not skipped, so the cap only bounds catch-up work.
const MAX_BEATS_PER_UPDATE = 8;

/**
 * @param {object} opts
 * @param {Array<{key:string,min:number,max:number,grid?:number}>} opts.channels
 * @param {Object<string,number>} opts.pose   mutated IN PLACE, never replaced
 * @param {Object<string,number>} [opts.home] pose the "snap home" beat returns to
 * @param {number} [opts.seed]                same seed + same dt sequence => same run
 * @param {number} [opts.period]              seconds per beat
 * @param {number} [opts.homeChance]
 */
export function createChoreographer({
  channels,
  pose,
  home = null,
  seed = 1,
  period = 1.6,
  homeChance = HOME_CHANCE,
} = {}) {
  // Bad input crashes here, loudly, rather than producing quiet nonsense downstream.
  if (!Array.isArray(channels) || channels.length === 0)
    throw new Error("choreo: `channels` must be a non-empty array of {key,min,max}");
  if (!pose || typeof pose !== "object")
    throw new Error("choreo: `pose` must be an object to mutate in place");
  if (!(period > 0)) throw new Error(`choreo: period must be > 0, got ${period}`);
  if (!(homeChance >= 0 && homeChance <= 1))
    throw new Error(`choreo: homeChance must be in [0,1], got ${homeChance}`);

  for (const ch of channels) {
    if (!ch || typeof ch.key !== "string" || ch.key === "")
      throw new Error("choreo: every channel needs a string `key`");
    if (!Number.isFinite(ch.min) || !Number.isFinite(ch.max) || !(ch.min < ch.max))
      throw new Error(`choreo: channel "${ch.key}" needs finite min < max`);
    if (!Number.isFinite(pose[ch.key]))
      throw new Error(`choreo: pose has no finite value for channel "${ch.key}"`);
    if (ch.grid !== undefined && !(ch.grid > 0))
      throw new Error(`choreo: channel "${ch.key}" grid must be > 0`);
  }

  const chans = channels.map((c) => ({
    key: c.key,
    min: c.min,
    max: c.max,
    range: c.max - c.min,
    grid: c.grid ?? (c.max - c.min) / GRID_DIVISIONS,
  }));
  const byKey = new Map(chans.map((c) => [c.key, c]));
  const homePose = {};
  for (const c of chans) homePose[c.key] = clamp(home?.[c.key] ?? pose[c.key], c.min, c.max);

  let rng = mulberry32(seed);
  let beatPeriod = period;
  let t = 0; // seconds into the current beat
  let beatIndex = 0;
  let plan = null;
  // Channels a hand has reclaimed for the remainder of this beat: the engine stops
  // writing them, and the next beat re-reads them live.
  const reclaimed = new Set();

  const write = (c, v) => {
    if (reclaimed.has(c.key)) return;
    pose[c.key] = clamp(v, c.min, c.max);
  };

  // ---- beat planning -------------------------------------------------------

  // Pick a target for `c` given where it is NOW: somewhere in the half of the range
  // FARTHER from `start` (so the move is a long one), favouring grid angles, and
  // leaving headroom at the far end for the overshoot to live in.
  function pickTarget(c, start) {
    const mid = (c.min + c.max) / 2;
    const up = start <= mid;
    const margin = TARGET_MARGIN * c.range;
    // the far half, minus the overshoot headroom at its outer end
    let lo = up ? mid : c.min + margin;
    let hi = up ? c.max - margin : mid;
    if (hi < lo) hi = lo;

    let target = lo + rng() * (hi - lo);

    if (rng() < GRID_CHANCE) {
      // nearest grid value that still lies inside [lo, hi]
      const k = (target - c.min) / c.grid;
      const cands = [Math.floor(k), Math.ceil(k)]
        .map((n) => c.min + n * c.grid)
        .filter((v) => v >= lo - 1e-9 && v <= hi + 1e-9);
      if (cands.length)
        target = cands.reduce((a, b) => (Math.abs(b - target) < Math.abs(a - target) ? b : a));
    }

    // a beat that barely moves is not a beat: shove it out to the far end
    if (Math.abs(target - start) < MIN_TRAVEL * c.range) target = up ? hi : lo;
    return clamp(target, c.min, c.max);
  }

  // Fisher-Yates on a copy, off the seeded rng — so the pick replays.
  function shuffled(list) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function planBeat() {
    reclaimed.clear();
    const isHome = chans.length > 0 && rng() < homeChance;

    const order = shuffled(chans);
    let mains;
    if (isHome) {
      mains = chans; // the WHOLE pose snaps home
    } else {
      const count = 1 + Math.floor(rng() * Math.min(3, Math.max(1, chans.length - 1)));
      mains = order.slice(0, count);
    }

    const legs = mains.map((c) => {
      const start = pose[c.key]; // LIVE: wherever the last beat, or a hand, left it
      const target = isHome ? homePose[c.key] : pickTarget(c, start);
      const travel = target - start;
      const dir = Math.sign(travel);
      // headroom past the target, inside the range — the overshoot lives here, so the
      // fly-past can never leave the channel.
      const headroom = dir > 0 ? c.max - target : target - c.min;
      const over = Math.min(OVERSHOOT * Math.abs(travel), Math.max(0, headroom));
      return { c, start, target, peak: target + dir * over };
    });

    // The anticipation slider: a DIFFERENT one, which winds up on the mains' behalf.
    // A home beat anticipates with nothing.
    let anticip = null;
    if (!isHome) {
      const mainKeys = new Set(mains.map((c) => c.key));
      const net = legs.reduce((s, l) => s + (l.target - l.start), 0);
      // which way the body must lean to counter the coming travel
      const netDir = net !== 0 ? Math.sign(net) : (rng() < 0.5 ? -1 : 1);
      const cands = order.filter((c) => !mainKeys.has(c.key));
      if (cands.length) {
        const roomOf = (c) => (netDir > 0 ? pose[c.key] - c.min : c.max - pose[c.key]);
        // first candidate with room to actually lean; else the first (its lean clamps)
        const pick = cands.find((c) => roomOf(c) >= LEAN_ROOM * c.range) ?? cands[0];
        const a0 = pose[pick.key]; // LIVE too
        const lean = (LEAN_MIN + rng() * LEAN_SPAN) * pick.range;
        // "a fraction of that slider's own range, CLAMPED to it"
        anticip = { c: pick, a0, peak: clamp(a0 - netDir * lean, pick.min, pick.max) };
      }
    }

    plan = { index: beatIndex, isHome, legs, anticip };
    return plan;
  }

  // ---- evaluation ----------------------------------------------------------

  // Write the pose for normalised beat time u in [0,1].
  function apply(u) {
    for (const l of plan.legs) {
      let v;
      if (u < T_MOVE) {
        v = l.start; // hold still while the wind-up happens
      } else if (u < T_BOUNCE) {
        // the long move: accelerate out, fly PAST the target, up to the peak
        v = l.start + (l.peak - l.start) * eases.inOutCubic((u - T_MOVE) / PHASE_MOVE);
      } else {
        // rattle down from the peak onto the target and stop dead on it
        v = l.peak + (l.target - l.peak) * eases.outBounce((u - T_BOUNCE) / PHASE_BOUNCE);
      }
      write(l.c, v);
    }

    const a = plan.anticip;
    if (a) {
      let v;
      if (u < T_MOVE) {
        // lean against the travel, reaching the lean early and HANGING there
        const p = Math.min(1, u / T_MOVE / LEAN_REACHED_AT);
        v = a.a0 + (a.peak - a.a0) * eases.inOutSine(p);
      } else {
        // unwind through the move, arriving home exactly as the mains land
        v = a.peak + (a.a0 - a.peak) * eases.inOutCubic((u - T_MOVE) / (1 - T_MOVE));
      }
      write(a.c, v);
    }
  }

  // Land the beat exactly: the mains stop DEAD on their targets, the wind-up is home.
  function land() {
    for (const l of plan.legs) write(l.c, l.target);
    if (plan.anticip) write(plan.anticip.c, plan.anticip.a0);
  }

  planBeat();
  apply(0);

  return {
    /** Advance the choreography and write the pose. dt in seconds. */
    update(dt) {
      if (!Number.isFinite(dt)) throw new Error(`choreo: dt must be finite, got ${dt}`);
      if (dt < 0) throw new Error(`choreo: dt must be >= 0, got ${dt}`);
      t += dt;
      // Bounded catch-up: at most MAX_BEATS_PER_UPDATE beats are resolved per call, so
      // a huge dt (backgrounded tab) costs O(1) work instead of stalling the frame.
      for (let i = 0; i < MAX_BEATS_PER_UPDATE && t >= beatPeriod; i++) {
        land(); // the beat that just ended finishes on its targets, exactly
        t -= beatPeriod;
        beatIndex++;
        planBeat(); // reads the pose LIVE, so it departs from where we just landed
      }
      if (t >= beatPeriod) t = t % beatPeriod; // dropped the excess beats, keep the phase
      apply(t / beatPeriod);
      return pose;
    },

    /** A hand took this channel: stop writing it until the next beat re-reads it. */
    reclaim(key) {
      if (!byKey.has(key)) throw new Error(`choreo: no channel "${key}" to reclaim`);
      reclaimed.add(key);
    },

    /** Beat period in seconds. */
    get period() {
      return beatPeriod;
    },
    set period(p) {
      if (!(p > 0)) throw new Error(`choreo: period must be > 0, got ${p}`);
      // keep the phase, so retuning mid-beat does not jump
      const u = t / beatPeriod;
      beatPeriod = p;
      t = u * p;
    },

    /** Restart the sequence. Same seed => the same run, replayed. */
    reset(newSeed = seed) {
      rng = mulberry32(newSeed);
      t = 0;
      beatIndex = 0;
      planBeat();
      apply(0);
    },

    /** What the current beat is doing — for captions and for the checker. */
    get state() {
      const u = t / beatPeriod;
      return {
        beat: beatIndex,
        u,
        phase: u < T_MOVE ? "anticipation" : u < T_BOUNCE ? "move" : "bounce",
        isHome: plan.isHome,
        mains: plan.legs.map((l) => l.c.key),
        starts: Object.fromEntries(plan.legs.map((l) => [l.c.key, l.start])),
        targets: Object.fromEntries(plan.legs.map((l) => [l.c.key, l.target])),
        antStart: plan.anticip ? plan.anticip.a0 : null,
        antPeak: plan.anticip ? plan.anticip.peak : null,
        anticipation: plan.anticip ? plan.anticip.c.key : null,
        reclaimed: [...reclaimed],
      };
    },

    /** The channels it drives, and the pose it drives them into (the same object). */
    get channels() {
      return chans;
    },
    get pose() {
      return pose;
    },
  };
}
