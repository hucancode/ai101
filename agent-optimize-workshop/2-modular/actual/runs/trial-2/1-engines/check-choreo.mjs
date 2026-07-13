// check-choreo.mjs — headless verification of engines/choreo.js against its spec.
//   node check-choreo.mjs
//
// Drives a synthetic slider set for thousands of steps and asserts, numerically:
//   1. the pose object is mutated IN PLACE (same object identity, values move)
//   2. a seeded run replays identically
//   3. no channel ever leaves its range — including the wind-up, and after a drag
//   4. targets are read LIVE: a beat that starts after a hand-drag departs from
//      where the hand left it
//   5. the beat really is anticipation -> move -> bounce, with the ANTICIPATION ON A
//      DIFFERENT SLIDER than the main move:
//        a. anticipation key is never a main key
//        b. the anticipating slider moves FIRST while the main sliders hold dead still
//        c. the wind-up leans AGAINST the net main travel, and never with it
//        d. the main move flies PAST its target, then settles back exactly onto it
//        e. the wind-up returns home as the mains land
//   6. beat period is tunable; the "snap home" beat exists and anticipates with nothing
//   7. an anticipation lean never throws its channel out of bounds (bound-hugging rig)

import { createChoreographer } from "./engines/choreo.js";

let failures = 0;
let checks = 0;
function ok(cond, label, detail = "") {
  checks++;
  if (!cond) {
    failures++;
    console.error(`  FAIL  ${label}${detail ? "  -- " + detail : ""}`);
  }
  return cond;
}
function section(name) {
  console.log(`\n== ${name}`);
}

const EPS = 1e-9;

// A synthetic slider set: joint-angle-ish channels with assorted ranges, including
// asymmetric ones and one tiny one.
const CHANNELS = [
  { key: "spine", min: -0.6, max: 0.6 },
  { key: "shoulderL", min: -1.6, max: 1.6 },
  { key: "shoulderR", min: -1.6, max: 1.6 },
  { key: "elbowL", min: 0, max: 2.4 },
  { key: "elbowR", min: 0, max: 2.4 },
  { key: "hipL", min: -1.2, max: 0.9 },
  { key: "hipR", min: -1.2, max: 0.9 },
  { key: "head", min: -0.4, max: 0.4 },
  { key: "tail", min: -0.15, max: 0.15 },
];
const HOME = Object.fromEntries(CHANNELS.map((c) => [c.key, (c.min + c.max) / 2]));
const freshPose = () => ({ ...HOME });
const chOf = (key) => CHANNELS.find((c) => c.key === key);

const DT = 1 / 60;
const PERIOD = 1.6;

// ---------------------------------------------------------------------------
section("1. mutates the pose object in place");
{
  const pose = freshPose();
  const before = pose;
  const keysBefore = Object.keys(pose).slice();
  const ch = createChoreographer({ channels: CHANNELS, pose, home: HOME, seed: 7, period: PERIOD });

  let moved = 0;
  for (let i = 0; i < 6000; i++) {
    const ret = ch.update(DT);
    ok(ret === before, "update() returns the very same pose object");
    if (i === 5999) {
      for (const c of CHANNELS) if (Math.abs(pose[c.key] - HOME[c.key]) > 1e-6) moved++;
    }
  }
  ok(pose === before, "pose identity unchanged after 6000 steps");
  ok(ch.pose === before, "engine reports the caller's object as its pose");
  ok(
    Object.keys(pose).join() === keysBefore.join(),
    "no keys added or removed",
    Object.keys(pose).join(),
  );
  ok(moved > 0, "values actually changed (not a no-op)", `${moved} channels off home`);
}

// ---------------------------------------------------------------------------
section("2. seeded -> a run replays identically");
{
  const trace = (seed) => {
    const pose = freshPose();
    const ch = createChoreographer({ channels: CHANNELS, pose, home: HOME, seed, period: PERIOD });
    const out = [];
    for (let i = 0; i < 4000; i++) {
      ch.update(DT);
      for (const c of CHANNELS) out.push(pose[c.key]);
    }
    return out;
  };
  const a = trace(1234);
  const b = trace(1234);
  const c = trace(1235);
  ok(a.length === b.length && a.every((v, i) => v === b[i]), "same seed -> bit-identical trace");
  ok(a.some((v, i) => v !== c[i]), "a different seed -> a different run");

  // reset() replays too
  const pose = freshPose();
  const e = createChoreographer({ channels: CHANNELS, pose, home: HOME, seed: 99, period: PERIOD });
  const run = () => {
    const out = [];
    for (let i = 0; i < 1200; i++) {
      e.update(DT);
      out.push(...CHANNELS.map((c2) => pose[c2.key]));
    }
    return out;
  };
  const r1 = run();
  Object.assign(pose, HOME);
  e.reset(99);
  const r2 = run();
  ok(r1.every((v, i) => v === r2[i]), "reset(seed) replays the same run");
}

// ---------------------------------------------------------------------------
section("3. no channel ever leaves its range (10k steps, jittered dt, drags, home beats)");
{
  const pose = freshPose();
  const ch = createChoreographer({ channels: CHANNELS, pose, home: HOME, seed: 42, period: PERIOD });
  let worst = 0;
  let outOfRange = 0;
  // deterministic jitter so the check itself replays
  let s = 1;
  const jitter = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

  for (let i = 0; i < 10000; i++) {
    ch.update(DT * (0.5 + jitter()));
    // every so often a hand slams a slider to a random spot in its range
    if (i % 137 === 0) {
      const c = CHANNELS[Math.floor(jitter() * CHANNELS.length)];
      pose[c.key] = c.min + jitter() * (c.max - c.min);
      ch.reclaim(c.key);
    }
    for (const c of CHANNELS) {
      const v = pose[c.key];
      if (!(v >= c.min - EPS && v <= c.max + EPS)) outOfRange++;
      worst = Math.max(worst, c.min - v, v - c.max);
    }
  }
  ok(outOfRange === 0, "no channel left its range", `${outOfRange} violations, worst excess ${worst}`);
}

// ---------------------------------------------------------------------------
section("7. a wind-up on a bound-hugging rig still never leaves the range");
{
  // every channel starts pinned to a bound: the lean has nowhere to go on some of them
  for (const pin of ["min", "max"]) {
    const pose = Object.fromEntries(CHANNELS.map((c) => [c.key, c[pin]]));
    const ch = createChoreographer({ channels: CHANNELS, pose, home: pose, seed: 5, period: 0.9 });
    let bad = 0;
    for (let i = 0; i < 4000; i++) {
      ch.update(DT);
      for (const c of CHANNELS)
        if (!(pose[c.key] >= c.min - EPS && pose[c.key] <= c.max + EPS)) bad++;
    }
    ok(bad === 0, `all channels pinned to ${pin}: still in range`, `${bad} violations`);
  }
}

// ---------------------------------------------------------------------------
section("4. targets read LIVE — a beat after a hand-drag departs from where the hand left it");
{
  const pose = freshPose();
  const ch = createChoreographer({ channels: CHANNELS, pose, home: HOME, seed: 11, period: PERIOD });
  const steps = Math.round(PERIOD / DT);
  let tested = 0;

  for (let beat = 0; beat < 40; beat++) {
    // walk to just before the beat boundary
    for (let i = 0; i < steps - 1; i++) ch.update(DT);
    // a hand grabs a channel and parks it somewhere arbitrary
    const key = CHANNELS[beat % CHANNELS.length].key;
    const c = chOf(key);
    const dragged = c.min + ((beat * 0.137) % 1) * (c.max - c.min);
    pose[key] = dragged;
    ch.reclaim(key);
    // cross the boundary: a new beat is planned, reading the pose LIVE
    const before = ch.state.beat;
    let guard = 0;
    while (ch.state.beat === before && guard++ < 200) ch.update(DT);
    ok(guard < 200, "beat boundary crossed");

    const st = ch.state;
    if (st.mains.includes(key)) {
      // a main holds dead still through the anticipation phase, so right after the
      // boundary it must sit exactly where the hand left it
      ok(
        Math.abs(st.starts[key] - dragged) < 1e-9,
        `new beat's start for "${key}" is the dragged value`,
        `start=${st.starts[key]} dragged=${dragged}`,
      );
      ok(
        Math.abs(pose[key] - dragged) < 1e-9,
        `"${key}" departs from the dragged value, not from where the engine had it`,
      );
      ok(
        Math.abs(st.targets[key] - dragged) > 1e-6,
        `"${key}" got a fresh target away from the drag`,
      );
      tested++;
    } else if (st.anticipation === key) {
      ok(
        Math.abs(st.antStart - dragged) < 1e-9,
        `wind-up on "${key}" starts from the dragged value`,
        `a0=${st.antStart} dragged=${dragged}`,
      );
      tested++;
    } else {
      ok(Math.abs(pose[key] - dragged) < 1e-9, `untouched "${key}" keeps the hand's value`);
      tested++;
    }
  }
  ok(tested === 40, "all 40 drags exercised", `${tested}/40`);
}

// ---------------------------------------------------------------------------
section("5. the beat: anticipation -> move -> bounce, wind-up on a DIFFERENT slider");
{
  const pose = freshPose();
  const ch = createChoreographer({ channels: CHANNELS, pose, home: HOME, seed: 2024, period: PERIOD });
  const steps = Math.round(PERIOD / DT); // 96 samples per beat

  let regular = 0;
  let homeBeats = 0;
  let leanZero = 0;
  let sameKey = 0;
  let holdViolations = 0;
  let antIdleViolations = 0;
  let overshootFails = 0;
  let landFails = 0;
  let leanWrongWay = 0;
  let unwindFails = 0;

  for (let beat = 0; beat < 300; beat++) {
    const st0 = ch.state; // the plan for the beat we are about to walk through
    const mains = st0.mains;
    const ant = st0.anticipation;
    const starts = { ...st0.starts };
    const targets = { ...st0.targets };
    const a0 = st0.antStart;

    if (st0.isHome) {
      homeBeats++;
      ok(ant === null, "a snap-home beat anticipates with nothing");
      ok(
        mains.length === CHANNELS.length,
        "a snap-home beat moves the WHOLE pose",
        `${mains.length}/${CHANNELS.length}`,
      );
    } else {
      regular++;
      // (a) the wind-up is on a DIFFERENT slider than the main move
      if (ant !== null && mains.includes(ant)) sameKey++;
      ok(ant !== null, "a regular beat has an anticipation slider");
      ok(mains.length >= 1 && mains.length <= 3, "1-3 main sliders", `${mains.length}`);
    }

    // walk the beat, sampling
    const samples = []; // { u, phase, vals }
    // steps + 2: float accumulation can put the rollover a step either side of `steps`
    for (let i = 0; i < steps + 2; i++) {
      ch.update(DT);
      const s = ch.state;
      if (s.beat !== st0.beat) break; // rolled over
      samples.push({
        u: s.u,
        phase: s.phase,
        main: Object.fromEntries(mains.map((k) => [k, pose[k]])),
        ant: ant ? pose[ant] : null,
      });
    }

    if (st0.isHome || ant === null) continue;

    const antPhase = samples.filter((s) => s.phase === "anticipation");
    const movePhase = samples.filter((s) => s.phase === "move");
    const bouncePhase = samples.filter((s) => s.phase === "bounce");
    ok(antPhase.length > 0 && movePhase.length > 0 && bouncePhase.length > 0, "all three phases occur");
    ok(
      movePhase.length > antPhase.length && movePhase.length > bouncePhase.length,
      "the move is the LONG phase",
      `${antPhase.length}/${movePhase.length}/${bouncePhase.length}`,
    );

    // (b) during the anticipation phase: mains HOLD, the wind-up MOVES
    for (const s of antPhase)
      for (const k of mains) if (Math.abs(s.main[k] - starts[k]) > 1e-12) holdViolations++;
    const leanMax = antPhase.reduce((m, s) => Math.max(m, Math.abs(s.ant - a0)), 0);
    if (leanMax <= 1e-9) leanZero++;
    else {
      // the wind-up is ALREADY moving while every main is still frozen: that is
      // "the anticipation slider animates FIRST"
      const firstMoving = antPhase.find((s) => Math.abs(s.ant - a0) > 1e-9);
      if (!firstMoving) antIdleViolations++;
      else
        for (const k of mains)
          if (Math.abs(firstMoving.main[k] - starts[k]) > 1e-12) antIdleViolations++;
    }

    // (c) the lean goes AGAINST the net main travel
    const net = mains.reduce((s, k) => s + (targets[k] - starts[k]), 0);
    const leanDev = antPhase.reduce(
      (m, s) => (Math.abs(s.ant - a0) > Math.abs(m) ? s.ant - a0 : m),
      0,
    );
    if (net !== 0 && Math.abs(leanDev) > 1e-9 && Math.sign(leanDev) === Math.sign(net))
      leanWrongWay++;

    // (d) each main flies PAST its target, then settles back exactly onto it
    for (const k of mains) {
      const dir = Math.sign(targets[k] - starts[k]);
      if (dir === 0) continue;
      const peak = samples.reduce((m, s) => (dir > 0 ? Math.max(m, s.main[k]) : Math.min(m, s.main[k])), starts[k]);
      if (!((peak - targets[k]) * dir > 1e-6)) overshootFails++;
      // and after the bounce it is dead on the target
      const end = samples[samples.length - 1].main[k];
      if (Math.abs(end - targets[k]) > 2e-3) landFails++;
    }

    // (e) the wind-up unwinds home as they land
    const endAnt = samples[samples.length - 1].ant;
    if (Math.abs(endAnt - a0) > 2e-3) unwindFails++;
  }

  ok(regular > 200, "plenty of regular beats sampled", `${regular}`);
  ok(homeBeats > 0, "snap-home beats happen", `${homeBeats}`);
  ok(sameKey === 0, "ANTICIPATION IS NEVER A MAIN-MOVE KEY", `${sameKey} collisions in ${regular} beats`);
  ok(holdViolations === 0, "mains hold dead still through the anticipation phase", `${holdViolations}`);
  ok(antIdleViolations === 0, "the wind-up moves FIRST, while the mains are still frozen", `${antIdleViolations}`);
  ok(leanWrongWay === 0, "the wind-up never leans WITH the travel", `${leanWrongWay}`);
  ok(
    leanZero <= regular * 0.05,
    "the wind-up is a real, non-zero lean (>=95% of beats)",
    `${leanZero} flat of ${regular}`,
  );
  ok(overshootFails === 0, "every main move overshoots PAST its target", `${overshootFails}`);
  ok(landFails === 0, "every main move settles back ONTO its target", `${landFails}`);
  ok(unwindFails === 0, "the wind-up arrives home as the mains land", `${unwindFails}`);
  console.log(
    `  (${regular} regular beats, ${homeBeats} snap-home beats, ` +
      `${leanZero} beats with a flat wind-up)`,
  );
}

// ---------------------------------------------------------------------------
section("6. beat period is tunable");
{
  const count = (period) => {
    const pose = freshPose();
    const ch = createChoreographer({ channels: CHANNELS, pose, home: HOME, seed: 3, period });
    for (let i = 0; i < Math.round(10 / DT); i++) ch.update(DT);
    return ch.state.beat;
  };
  // 600 steps of 1/60 accumulates to 9.999...s, so a beat may land either side of the
  // 10s mark: allow the one-beat boundary, but the count must track the period.
  const slow = count(2.0);
  const fast = count(0.5);
  ok(Math.abs(slow - 5) <= 1, "~10s at period 2.0 -> ~5 beats", `${slow}`);
  ok(Math.abs(fast - 20) <= 1, "~10s at period 0.5 -> ~20 beats", `${fast}`);
  ok(fast > slow * 3, "a shorter period runs proportionally more beats", `${fast} vs ${slow}`);

  const pose = freshPose();
  const ch = createChoreographer({ channels: CHANNELS, pose, home: HOME, seed: 3, period: 2 });
  ch.update(1); // half way through the beat
  const u = ch.state.u;
  ch.period = 0.5;
  ok(Math.abs(ch.state.u - u) < 1e-12, "retuning the period mid-beat keeps the phase", `${ch.state.u} vs ${u}`);
}

// ---------------------------------------------------------------------------
section("bad input crashes loudly");
{
  const boom = (fn, label) => {
    let threw = false;
    try {
      fn();
    } catch {
      threw = true;
    }
    ok(threw, label);
  };
  boom(() => createChoreographer({ channels: [], pose: {} }), "empty channels throws");
  boom(
    () => createChoreographer({ channels: [{ key: "a", min: 1, max: 0 }], pose: { a: 0 } }),
    "min >= max throws",
  );
  boom(
    () => createChoreographer({ channels: [{ key: "a", min: 0, max: 1 }], pose: {} }),
    "pose missing a channel value throws",
  );
  boom(() => {
    const p = { a: 0.5 };
    createChoreographer({ channels: [{ key: "a", min: 0, max: 1 }], pose: p }).update(NaN);
  }, "NaN dt throws");
  boom(() => {
    const p = { a: 0.5 };
    createChoreographer({ channels: [{ key: "a", min: 0, max: 1 }], pose: p }).reclaim("nope");
  }, "reclaiming an unknown channel throws");
}

console.log(
  `\n${failures === 0 ? "PASS" : "FAIL"} — ${checks - failures}/${checks} assertions passed`,
);
process.exit(failures === 0 ? 0 : 1);
