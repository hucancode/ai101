// choreo.js — the dance. Beats of ~1s, written straight into the SAME pose object
// the sliders are bound to, so the panel animates with the robot.
//
// The shape of a beat:
//   t+0.00  two leaf joints (fingers / wrists / elbow) ramp into new angles  — anticipation
//   t+0.25  ONE root-near joint (waist / shoulder / neck) makes the main move: it
//           sails PAST the target, then rattles back down onto it                — the landing
//   t+~0.9  everything holds. The next beat plans from wherever it stopped.
// Targets snap to multiples of 45 deg and are always chosen AWAY from where the
// joint currently sits. Every so often the whole thing snaps back to rest.
// The legs are never touched.
//
// Everything is drawn from a seeded PRNG: same seed -> same dance, every run.

import { eases, mulberry32, clamp } from "./gfx.js";
import { CHANNELS, CHANNEL_BY_KEY, restPose, gridOf } from "./pose.js";

const BEAT = 1.0;               // seconds per beat
const LEAD = 0.35;              // anticipation ramp
const MAIN_DELAY = 0.25;        // the big joint comes in after the leaves have started
const MAIN_DUR = 0.6;
const RESET_DUR = 0.65;
const RESET_CHANCE = 0.14;      // "now and then, drop everything"
const AWAY = 30;                // a target must be at least this far from the current value
const OVERSHOOT = 0.22;         // fraction of the travel the main joint sails past by
const MAX_TRACKS = 24;          // hard cap: a beat adds <= 12 tracks, and old ones expire

const LEAF = ["fingerCurl", "wristBend", "wristTilt", "wristTwist", "elbow"];
const ROOT = ["waistTwist", "waistBend", "waistTilt", "shoulder", "armOut", "headYaw", "headPitch"];
const DANCED = CHANNELS.filter((c) => !c.leg).map((c) => c.key); // never the legs

// travel PAST the target, then bounce back down onto it — the weight of the landing
function landing(u) {
  if (u < 0.55) return (1 + OVERSHOOT) * eases.inOutCubic(u / 0.55);
  return (1 + OVERSHOOT) - OVERSHOOT * eases.outBounce((u - 0.55) / 0.45);
}

export function createChoreographer(pose, seed) {
  const rng = mulberry32(seed);
  const rest = restPose();
  let tracks = [];        // {key, from, to, t0, dur, ease}
  let nextBeat = 0.6;     // a moment of stillness before the first move
  let beatIndex = 0;

  const pick = (list, n) => {
    const bag = list.slice();
    const out = [];
    for (let i = 0; i < n && bag.length; i++) out.push(bag.splice((rng() * bag.length) | 0, 1)[0]);
    return out;
  };

  // a machine-square angle, aimed away from where this joint currently sits
  function targetFor(key) {
    const cur = pose[key];
    const grid = gridOf(key);
    const far = grid.filter((g) => Math.abs(g - cur) >= AWAY);
    if (far.length) return far[(rng() * far.length) | 0];
    // degenerate range (nowhere 45 deg away): take the furthest grid point we have
    return grid.reduce((a, b) => (Math.abs(b - cur) > Math.abs(a - cur) ? b : a));
  }

  function add(key, to, t0, dur, ease) {
    const c = CHANNEL_BY_KEY.get(key);
    tracks.push({ key, from: pose[key], to: clamp(to, c.min, c.max), t0, dur, ease, c });
  }

  function planBeat(t) {
    beatIndex++;
    if (rng() < RESET_CHANCE) {                     // snap back to rest, no contortion drift
      for (const key of DANCED) add(key, rest[key], t, RESET_DUR, eases.inOutCubic);
      return;
    }
    for (const key of pick(LEAF, 2)) add(key, targetFor(key), t, LEAD, eases.inOutCubic);
    const [main] = pick(ROOT, 1);
    add(main, targetFor(main), t + MAIN_DELAY, MAIN_DUR, landing);
    if (tracks.length > MAX_TRACKS)
      throw new Error(`choreo: ${tracks.length} live tracks — beat ${beatIndex} leaked`);
  }

  return {
    /** the hand takes over: kill the machine's grip on this channel */
    release(key) {
      tracks = tracks.filter((tr) => tr.key !== key);
    },

    update(t) {
      if (t >= nextBeat) {
        planBeat(nextBeat);
        nextBeat += BEAT;
        if (t >= nextBeat) nextBeat = t + BEAT; // a stalled tab must not replay a queue of beats
      }
      const live = [];
      for (const tr of tracks) {
        if (t < tr.t0) { live.push(tr); continue; }          // not started: hold
        const u = (t - tr.t0) / tr.dur;
        if (u >= 1) { pose[tr.key] = tr.to; continue; }      // done: land it and drop it
        // the landing ease sails past 1 on purpose; the clamp only bites if a target
        // sits on the channel's limit, where there is no room left to overshoot into.
        const v = tr.from + (tr.to - tr.from) * tr.ease(u);
        pose[tr.key] = clamp(v, tr.c.min, tr.c.max);
        live.push(tr);
      }
      tracks = live;
    },
  };
}
