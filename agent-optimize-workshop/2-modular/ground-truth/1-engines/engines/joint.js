// JOINT ENGINE — two mechanisms, one seating rule.
//
// A joint is handed exactly ONE thing: the SECTION of the child's plug (the cross-
// section of the face the child hangs by). Every dimension is a fixed ratio of it.
// There is no `size`, no `slim`, no per-joint tuning table — so a joint cannot be
// fatter than the limb it sits in, and its two halves cannot disagree.
//
//   R = inradius(section)   the one scalar
//   W = the section across the pin        K = half the section across the swing
//
// SEATING RULE — the whole of it:
//
//   centre = anchor.pos + anchor.n * seat
//   the child's root face lands `reach` beyond the centre, down the child's own -Y
//   rest = the frame [pin, -aim, pin x -aim]      (aim = where the limb should point)
//
// `seat` and `reach` are not numbers anyone types: they are read off the pieces the
// engine just built. The gap between the parent's surface and the child's is
// therefore algebraically zero, and geometry cannot drift from kinematics — they
// are the same expression. Both base plates ARE the section, so a joint's plate
// matches the face it lands on exactly, never proud, never sunk.
//
// Two frames, same origin (the rotation centre) and same +X (the pin):
//   F — female: +Y is the anchor normal, so its pieces hang -Y onto the parent face
//   C — child:  +Y is -aim,             so its pieces hang -Y toward the child
// With no corner the two differ by a half turn: "normals oppose" falls out of the
// construction instead of being a rule to obey.
import { THREE, vAdd, vScale, vNorm, vCross, translate, rotY, applyM, HPI, rad } from "../gfx.js";
import {
  cylinder, sphere, socket, plate, extrudeX, handle, inradius, spanU, spanV,
} from "./modeling.js";

// ---- the ratio tables — the entire tuning surface of every joint in the system --
export const FIT = {
  PLATE: 0.25,      // base plate thickness              / R
  // hinge — the reach is deliberately SHORT: a joint is a knuckle a limb chains
  // through, not a length of limb. seat + reach = 1.5 R for a round plug.
  WAIST: 1 / 1.2,   // the KNUCKLE's section             / the plug's
  ARM: 0.22,        // one clevis arm, across the pin    / W
  CLR: 0.03,        // clearance, per side               / W    -> tongue = 0.50 W
  BODY: 0.50,       // knuckle centre -> plate face      / K
  PIN: 0.30,        // pin radius                        / min(K, W/2)
  PROUD: 0.05,      // pin protrusion past each arm      / R
  // ball
  BALL: 0.70,       // ball radius                       / R
  BALL_CLR: 0.04,   // socket inner over the ball        / ball
  WALL: 0.28,       // socket shell                      / inner -> outer = 0.93 R
  HOLE: 0.55,       // shaft hole                        / ball  (< 1: captures it)
  SHAFT: 0.35,      // shaft radius                      / ball  (< HOLE: it exits)
  DROP: 1.05,       // ball centre -> plate face         / ball  (> 1: clears the ball)
  RIM: 0.25,        // male plate clearance over the rim / R
};

// ---- dimensions ------------------------------------------------------------
// Both mechanisms, from the section alone. These asserts ARE the old spec's whole
// "get the ball/socket fit right" section — a fit that can't be got wrong.
export function dims(kind, sec, { collar = false } = {}) {
  const R = inradius(sec), plateT = FIT.PLATE * R;
  if (kind === "ball") {
    const rb = FIT.BALL * R;
    const ri = rb * (1 + FIT.BALL_CLR);
    const ro = ri * (1 + FIT.WALL);
    const rh = FIT.HOLE * rb, shaftR = FIT.SHAFT * rb, drop = FIT.DROP * rb;
    const top = ro + FIT.RIM * R;
    if (!(rh < rb && rb < ri && ri < ro)) throw Error("ball: the socket must nest the ball");
    if (!(shaftR < rh)) throw Error("ball: the shaft must clear the hole");
    if (!(ro <= R)) throw Error("ball: the socket is wider than the limb");
    if (!(drop > rb)) throw Error("ball: the base plate clips the ball");
    return { R, plateT, rb, ri, ro, rh, shaftR, drop, top, seat: drop + plateT, reach: top + plateT };
  }
  // the KNUCKLE is cut inside the plug: the base plate is the plug's full section, the
  // clevis is FIT.WAIST of it, so the plate always stands proud of the arms it carries
  // and a joint reads as hardware bolted to a limb rather than as the limb pinched.
  const W = FIT.WAIST * spanU(sec), K = (FIT.WAIST * spanV(sec)) / 2;   // pin runs along u
  const armT = FIT.ARM * W, clr = FIT.CLR * W;
  const tongueT = W - 2 * armT - 2 * clr;
  const body = FIT.BODY * K, pinR = FIT.PIN * Math.min(K, W / 2);
  if (!(tongueT > 0)) throw Error("hinge: the tongue does not fit its clevis");
  if (Math.abs(tongueT + 2 * armT + 2 * clr - W) > 1e-9) throw Error("hinge: the stack is not the knuckle's width");
  if (!(W < spanU(sec) && 2 * K < spanV(sec))) throw Error("hinge: the clevis overhangs its base plate");
  if (!(pinR < K)) throw Error("hinge: the pin is wider than the knuckle");
  const d = {
    R, plateT, W, K, armT, clr, tongueT, body, pinR,
    pinLen: W + 2 * FIT.PROUD * R,
    arm: (tongueT + 2 * clr + armT) / 2,               // arm centre, off the pin's midpoint
    seat: body + plateT + (collar ? plateT : 0),       // a collar adds the seat plate it spins on
    reach: body + plateT,
  };
  if (kind === "universal") {
    d.stage = 2 * body + plateT;                       // centre A -> centre B (they share a plate)
    d.reach = d.stage + body + plateT + (collar ? plateT : 0);
  }
  return d;
}

// ---- the one hardware shape ------------------------------------------------
// The D-plate: a knuckle at the origin, a body reaching -Y, thickness along X. The
// female arm and the male tongue are the SAME solid at two thicknesses, so a clevis
// and its tongue cannot mismatch. Everything else is a lathe (pin, ball, cup, plate).
function dplate(K, body, th, seg = 16) {
  const L = +(body / K).toFixed(4);
  const gen = () => {
    const o = [[-1, -L], [1, -L], [1, 0]];
    for (let i = 1; i <= seg; i++) {                   // the knuckle: a half turn, CCW
      const t = (i / seg) * Math.PI;
      o.push([Math.cos(t), Math.sin(t), i < seg]);
    }
    return extrudeX(o, 1);
  };
  return handle(`dplate:${L}:${seg}`, gen, [th, K, K], { kind: "dplate", K, L });
}

// ---- build -----------------------------------------------------------------
// `anchor` — a face of the parent (from the modeling engine).
// `sec`    — the child's plug section: the ONLY dimension this engine is given.
// `aim`    — where the child's body should point, in parent space (default: straight
//            out of the anchor). A corner is expressed by aiming, never by a magic
//            re-seat rotation.
// `collar` — the joint also spins in its seat plate (a shoulder in its cone).
//
// Hands back the BONES (each a rotation node with a name and its static rest), the
// hardware already placed in the frame it belongs to, and the child's offset — so a
// rig never computes a position or a rotation of its own.
// where a child's body points, in the parent's own space. EVERY part hangs its body
// down its -Y (the modeling engine re-bases it so), which is the only fact a caller
// needs: a limb either follows the parent's body or opposes it. Naming the two beats
// writing a vector — a rig cannot get the sign of a word wrong.
const AIM = { along: [0, -1, 0], against: [0, 1, 0] };

export function build(kind, anchor, sec, { collar = false, aim = null, roll = 0, seg = 20 } = {}) {
  const d = dims(kind, sec, { collar });
  const n = vNorm(anchor.n);
  const dir = vNorm(typeof aim === "string" ? AIM[aim] : (aim ?? n));   // default: straight out
  if (kind === "ball" && 1 - Math.abs(dot(dir, n)) > 1e-6)
    throw Error("ball: a socket has no corner — aim must follow the anchor normal");

  // FRAMES. Both are built around FORWARD, never around the pin: a frame derived
  // from the pin would twist the whole chain below a corner (an arm hung off a flank
  // would carry its elbow's axis round with it). Keeping forward means a limb's
  // frame is the same on both flanks — which is why no geometry is ever mirrored.
  // `roll` turns a part about its own mount (the thumb, to face the fingers).
  const centre = vAdd(anchor.pos, vScale(n, d.seat));
  const frame = (Y, twist = 0) => {
    let Z = ortho(FWD, Y);
    if (twist) Z = vAdd(vScale(Z, Math.cos(twist)), vScale(vCross(Y, Z), -Math.sin(twist)));
    const X = vCross(Y, Z);
    return new THREE.Matrix4().set(
      X[0], Y[0], Z[0], centre[0],
      X[1], Y[1], Z[1], centre[1],
      X[2], Y[2], Z[2], centre[2],
      0, 0, 0, 1,
    );
  };
  const F = frame(n);                                    // female: +Y out of the parent's face
  const C = frame(vScale(dir, -1), rad(roll));           // child:  body hangs -Y
  // F -> C, for a bone that hangs under the female frame (a collar). It is a pure
  // rotation: the two frames share the rotation centre.
  const F2C = new THREE.Matrix4().copy(F).invert().multiply(C);

  // THE PIN — perpendicular to both the anchor normal and the limb's aim; straight
  // through a joint (aim = normal) it is the child's own X. On a MIRRORED anchor it
  // flips with the face, so one channel drives both flanks and the motion comes out
  // symmetric with no sign table anywhere.
  let pin = vCross(n, dir);
  pin = Math.hypot(...pin) < 1e-6 ? col(C, 0) : vNorm(pin);
  const pinF = localAxis(F, pin), pinC = localAxis(C, pin);

  const fixed = [];                              // female hardware, authored in F
  const bones = [];                              // [{ name, axis, sign, rest, meshes }]
  const bone = (name, axis, sign, rest) => bones.push({ name, axis, sign, rest, meshes: [] }) - 1;
  const on = (i, mesh) => bones[i].meshes.push(mesh);

  // the female base plate: it IS the child's section, so it lands on the anchor face
  // exactly — and its outer face sits ON that face, which is what makes `seat` true.
  const basePlate = () => translate(plate(sec, d.plateT), 0, -d.seat + d.plateT / 2, 0);

  if (kind === "ball") {
    fixed.push(basePlate());
    fixed.push(translate(cylinder(d.ro, d.drop, { seg }), 0, -d.drop / 2, 0));   // the shroud
    fixed.push(socket(d.ro, { wall: FIT.WALL, hole: FIT.HOLE, seg: seg + 8 }));  // the cup
    bone("rx", "x", 1, C);
    bone("ry", "y", 1, null);
    const rz = bone("rz", "z", 1, null);
    on(rz, sphere(d.rb, { seg, rings: Math.round(seg * 0.7) }));
    on(rz, translate(cylinder(d.shaftR, d.top, { seg: 18 }), 0, -d.top / 2, 0));
    on(rz, translate(plate(sec, d.plateT), 0, -d.top - d.plateT / 2, 0));
    return done(d, F, fixed, bones, [0, -d.reach, 0]);
  }

  // ---- hinge / universal ---------------------------------------------------
  // a clevis: two arms astride the tongue's slot, and the pin through all three.
  // `ax` is the LOCAL axis the pin runs along in whichever frame the piece lives in.
  const clevis = (push, y, ax) => {
    for (const s of [1, -1]) {
      const arm = ax === "z" ? rotY(dplate(d.K, d.body, d.armT), HPI) : dplate(d.K, d.body, d.armT);
      push(ax === "z" ? translate(arm, 0, y, s * d.arm) : translate(arm, s * d.arm, y, 0));
    }
    push(translate(cylinder(d.pinR, d.pinLen, { axis: ax, seg: 16 }), 0, y, 0));
  };
  const tongue = (y, ax) => {
    const t = dplate(d.K, d.body, d.tongueT);
    return translate(ax === "z" ? rotY(t, HPI) : t, 0, y, 0);
  };

  if (kind === "hinge") {
    fixed.push(basePlate());
    let host = -1;
    if (collar) {
      // the clevis turns bodily in a seat plate the PARENT holds: one extra bone,
      // living in the female frame, spinning about the anchor normal
      host = bone("collar", "y", 1, F);
      on(host, translate(plate(sec, d.plateT), 0, -d.seat + 1.5 * d.plateT, 0));
    }
    clevis(host < 0 ? (m) => fixed.push(m) : (m) => on(host, m), 0, pinF.axis);
    const p = bone("pin", pinC.axis, pinC.sign, collar ? F2C : C);
    on(p, tongue(0, pinC.axis));
    on(p, translate(plate(sec, d.plateT), 0, -d.reach + d.plateT / 2, 0));
    return done(d, F, fixed, bones, [0, -d.reach, 0]);
  }

  // UNIVERSAL — two hinges at right angles. Stage B's clevis hangs off stage A's
  // tongue plate; they SHARE it. One joint to the caller, three bones to the rig.
  const axB = pinC.axis === "x" ? "z" : "x";
  fixed.push(basePlate());
  clevis((m) => fixed.push(m), 0, pinF.axis);

  const a = bone("pinA", pinC.axis, pinC.sign, C);
  on(a, tongue(0, pinC.axis));
  on(a, translate(plate(sec, d.plateT), 0, -(d.body + d.plateT / 2), 0));   // the shared plate
  clevis((m) => on(a, m), -d.stage, axB);

  const b = bone("pinB", axB, 1, new THREE.Matrix4().makeTranslation(0, -d.stage, 0));
  on(b, tongue(0, axB));
  on(b, translate(plate(sec, d.plateT), 0, -(d.body + d.plateT / 2), 0));
  if (collar) {                                       // the twist: a disc turning on a disc
    const t = bone("twist", "y", 1, null);
    on(t, translate(plate(sec, d.plateT), 0, -(d.body + 1.5 * d.plateT), 0));
  }
  return done(d, F, fixed, bones, [0, -(d.reach - d.stage), 0]);
}

// female hardware is authored in F; lift it into the parent's space once, here.
function done(d, F, fixed, bones, childOffset) {
  for (const m of fixed) applyM(m, F);
  return { dims: d, fixed, bones, childOffset };
}

// ---- frame helpers ---------------------------------------------------------
const FWD = [0, 0, 1];                                    // every part is built +Z forward
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
// the part of `v` perpendicular to `y` (falls back when they are parallel)
function ortho(v, y) {
  let o = vAdd(v, vScale(y, -dot(v, y)));
  if (Math.hypot(...o) < 1e-6) {
    const alt = [0, 1, 0];
    o = vAdd(alt, vScale(y, -dot(alt, y)));
  }
  return vNorm(o);
}
const col = (M, i) => [M.elements[i * 4], M.elements[i * 4 + 1], M.elements[i * 4 + 2]];
// express a world direction in a frame's basis: which local axis is it, and which way?
function localAxis(M, v) {
  const c = [dot(col(M, 0), v), dot(col(M, 1), v), dot(col(M, 2), v)];
  const i = c.map(Math.abs).indexOf(Math.max(...c.map(Math.abs)));
  if (Math.abs(c[i]) < 0.999) throw Error("joint: the pin is not square to its frame");
  return { axis: "xyz"[i], sign: Math.sign(c[i]) };
}
