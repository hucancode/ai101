// JOINT ENGINE — the two mechanisms and the mating that seats one on another.
// It generates NO geometry: the caller supplies the piece meshes (female arm, male
// tongue, female ball socket, male ball + shaft, pin, base plate) and this engine
// owns their DIMENSIONS and their ROTATING ORIGIN — where each piece sits and how
// it is turned. So it depends on the shared math alone, no primitive generators.
//
// Exactly TWO mechanisms: a HINGE (1 pin) and a BALL (socket). createHinge /
// createBall(size, slim) return the two compatible HALVES (female + male) + a base;
// each dimension is a pure function of (size, slim). A caller lays parts around a
// joint with hingeMounts/ballMounts, never the raw dims.
//
// MATING seats a child slot frame on a parent's: origins coincide, forwards align,
// normals OPPOSE. A slot { pos, n, f } is a frame (origin, outward normal, forward
// tangent ⊥ n). `mate` SOLVES the rest rotation from the frames, so a link table
// stays pure data.
import { HPI, rotX, rotY, rotZ, translate, vNorm, vCross, vScale, m3Mul, m3T } from "../gfx.js";

const PIN_OUT_MIN = 0.005;

// size, slim -> the concrete dimensions a joint is built at. Tuned small + slim:
// thin arms, shallow knuckle, short body — reads as hardware, not a limb.
function hingeDims(size, slim = 1) {
  const gap = size, armT = 0.45 * size * slim, armH = 1.3 * size, depth = 1.3 * size;
  const pinR = 0.34 * size, clr = 0.06 * size, bridgeT = 1.2 * armT;
  const tip = 0.35 * armH, bodyLen = armH - tip, gapW = gap + 2 * armT + 2 * clr;
  return {
    gap, armT, depth, pinR, clr, bridgeT, bodyLen, gapW,
    knuckleR: depth / 2, bridgeY: bodyLen + bridgeT, pinHalf: gapW / 2 + armT + PIN_OUT_MIN,
  };
}
function ballDims(size, slim = 1) {
  const ballR = size, socketT = 0.42 * size, shaftR = 0.34 * size * slim;
  const shaftLen = 0.32 * size, baseW = 2.4 * size, baseT = 0.38 * size;
  return { ballR, socketT, cut: 0.75, shaftR, shaftLen, baseW, baseT, drop: ballR * 0.55, top: ballR + shaftLen };
}

// ---- mount offsets ---------------------------------------------------------
// Named distances a caller needs to lay parts around a joint, so it never reaches
// into raw dims. `jp = { size, slim? }`.
//   reach   origin -> the mount face the next part chains from
//   discR   radius of the female base disc (a cone seat circumscribing the U)
//   bridgeY origin -> the male bridge face
//   clearY  pin radius + clearance (how far a part clears the knuckle)
//   stackY  height of two arms + the shared middle base (a stacked hinge2)
export function hingeMounts({ size, slim } = {}) {
  const d = hingeDims(size, slim);
  return {
    reach: d.bridgeY,
    discR: Math.hypot(d.gapW + 2 * d.armT, d.depth) / 2,
    bridgeY: d.bridgeY,
    clearY: d.pinR + 2 * d.clr,
    stackY: 2 * d.bodyLen + d.bridgeT,
  };
}
//   top   ball center -> the male plate's far face      seat  center -> female seat
export function ballMounts({ size, slim } = {}) {
  const d = ballDims(size, slim);
  return { top: d.top + d.baseT, seat: d.drop + d.baseT };
}
// thin scalar aliases (single source: the mounts above)
export const hingeReach = (jp) => hingeMounts(jp).reach;
export const ballTop = (jp) => ballMounts(jp).top;
export const ballSeat = (jp) => ballMounts(jp).seat;

// ---- slot mating -----------------------------------------------------------
// a slot's orthonormal frame, columns [f, n×f, n]
const slotFrame = (s) => {
  const f = vNorm(s.f), n = vNorm(s.n), b = vCross(n, f);
  return [f[0], b[0], n[0], f[1], b[1], n[1], f[2], b[2], n[2]];
};
// the rest rotation carrying the child frame onto the parent frame, normals OPPOSED
export function mate(parent, child) {
  const f = vNorm(parent.f), n = vScale(vNorm(parent.n), -1), b = vCross(n, f);
  const target = [f[0], b[0], n[0], f[1], b[1], n[1], f[2], b[2], n[2]];
  return m3Mul(target, m3T(slotFrame(child)));
}

// place a caller's D-plate (knuckle on the origin, thickness along X, body -Y;
// down=true flips it). The engine owns this orientation; the caller only shapes it.
function seatArm(mesh, thickness, xc, down) {
  rotX(mesh, -HPI);
  rotY(mesh, HPI);
  if (down) rotZ(mesh, Math.PI);
  return translate(mesh, xc + (down ? -thickness / 2 : thickness / 2), 0, 0);
}

// ---- mechanisms ------------------------------------------------------------
// Bind a set of caller mesh-makers, get back the joint builders. Makers (each
// returns one THREE.Mesh, at the dims this engine passes):
//   arm(knuckleR, bodyLen, thickness)   the D-plate (female arm / male tongue)
//   pin(r, len)                          the hinge pin
//   socket(rOut, wallFrac, cut)          the ball socket shell
//   ball(r)   shaft(r, len)              the ball + its shaft
//   box(w, h, d)   disc(r, h)            base plates
export function createJointKit(mk) {
  // createHinge(size, slim) — pin = X through the origin. female = 2 arms + pin,
  // male = 1 wider tongue, base = the plate under either half.
  const createHinge = (size, slim = 1) => {
    const d = hingeDims(size, slim);
    return {
      female(add) {
        const armX = d.gapW / 2 + d.armT / 2;
        add(seatArm(mk.arm(d.knuckleR, d.bodyLen, d.armT), d.armT, -armX, true));
        add(seatArm(mk.arm(d.knuckleR, d.bodyLen, d.armT), d.armT, armX, true));
        add(translate(rotZ(mk.pin(d.pinR, 2 * d.pinHalf), -HPI), -d.pinHalf, 0, 0));
      },
      male(add) {
        const th = d.gap + 2 * d.armT;
        add(seatArm(mk.arm(d.knuckleR, d.bodyLen, th), th, 0, false));
      },
      base(add, { male = false, disc = false } = {}) {
        const w = (male ? d.gap : d.gapW) + 2 * d.armT;
        const yc = -(male ? 1 : -1) * (d.bodyLen + d.bridgeT / 2);
        add(disc
          ? translate(mk.disc(Math.hypot(w, d.depth) / 2, d.bridgeT), 0, yc - d.bridgeT / 2, 0)
          : translate(mk.box(w, d.bridgeT, d.depth), 0, yc, 0));
      },
    };
  };

  // createBall(size, slim) — ball center = origin. female = socket, male = ball +
  // shaft, base = the plate under either half.
  const createBall = (size, slim = 1) => {
    const d = ballDims(size, slim);
    return {
      female(add) {
        const rOut = d.ballR + 0.02 + d.socketT;
        add(translate(mk.socket(rOut, d.socketT / rOut, d.cut), 0, -d.drop, 0));
      },
      male(add) {
        add(mk.ball(d.ballR));
        add(mk.shaft(d.shaftR, d.top));
      },
      base(add, { male = false, disc = false } = {}) {
        const w = male ? d.baseW * 0.75 : d.baseW;
        const plate = disc ? mk.disc(w / 2, d.baseT) : mk.box(w, d.baseT, w);
        add(translate(plate, 0, male ? d.top + d.baseT / 2 : -d.drop - d.baseT / 2, 0));
      },
    };
  };

  // ---- composed joints (halves + bases, optionally posed) ------------------
  // a NAMED joint's two halves + bases with a static pose. "ball" = 3-DOF; "hinge"
  // = L-seated limb hinge (faces angled 90° so a limb chains through it).
  function buildJoint(name, fixed, moving, jp, { pose = {} } = {}) {
    if (name === "ball") {
      const h = createBall(jp.size, jp.slim);
      h.female(fixed); h.base(fixed, { disc: jp.disc });
      const mv = (g) => {
        let t = g;
        if (pose.rx) t = rotX(t, pose.rx);
        if (pose.ry) t = rotY(t, pose.ry);
        if (pose.rz) t = rotZ(t, pose.rz);
        return moving(t);
      };
      h.male(mv); h.base(mv, { male: true, disc: jp.disc });
      return;
    }
    const h = createHinge(jp.size, jp.slim);
    const disc = jp.disc ?? true;                    // L-seated hinge defaults to a disc base
    const R = (g) => rotY(rotZ(g, HPI), Math.PI);   // re-seat 90° into the corner
    const sf = pose.spinF || 0;
    const wrap = (sink) => (g) => { const t = R(g); sink(sf ? rotX(t, sf) : t); };
    const f = wrap(fixed);
    h.female(f); h.base(f, { disc });
    const sw = HPI + (pose.swing || 0);
    const m = (g) => wrap(moving)(rotX(g, sw));
    h.male(m); h.base(m, { male: true, disc });
  }

  // a female ball socket seated at `pos`; `orient` re-aims the opening (default up)
  const socketAt = (add, jp, pos, orient = null) =>
    buildJoint("ball", (g) => add(translate(orient ? orient(g) : g, pos[0], pos[1], pos[2])), () => {}, jp);
  // a male ball half at the origin; dir = -1 runs the shaft down, +1 up
  const maleBall = (add, jp, dir = -1) =>
    buildJoint("ball", () => {}, (g) => add(dir < 0 ? rotX(g, Math.PI) : g), jp);
  // a PLAIN hinge (no L re-seat) split across two parts: the parent emits the female
  // clevis + pin + base at its distal face; the child emits the male tongue + base.
  const hingeFixedAt = (add, jp, y, sides = {}) => {
    const h = createHinge(jp.size, jp.slim);
    const at = (g) => add(translate(g, 0, y, 0));
    h.female(at);
    if (!sides.female?.noBase) h.base(at, { male: false, disc: sides.female?.disc ?? jp.disc });
  };
  const hingeMale = (add, jp, sides = {}) => {
    const h = createHinge(jp.size, jp.slim);
    h.male(add);
    if (!sides.male?.noBase) h.base(add, { male: true, disc: sides.male?.disc ?? jp.disc });
  };

  return { createHinge, createBall, buildJoint, socketAt, maleBall, hingeFixedAt, hingeMale };
}
