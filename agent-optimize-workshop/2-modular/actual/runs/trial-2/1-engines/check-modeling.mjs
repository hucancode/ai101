// headless check for the modeling engine — run: node check-modeling.mjs
import * as M from "./engines/modeling.js";
import { THREE, TAU, HPI, vSub, vAdd, vScale, vLen, vNorm, vCross } from "./gfx.js";

let pass = 0, fail = 0;
const fails = [];
function ok(name, cond, detail = "") {
  if (cond) { pass++; return true; }
  fail++; fails.push(`${name}${detail ? " — " + detail : ""}`);
  return false;
}
const near = (a, b, e = 1e-4) => Math.abs(a - b) <= e;
const nearV = (a, b, e = 1e-4) => vLen(vSub(a, b)) <= e;
const fmt = (v) => "[" + v.map((x) => (+x).toFixed(3)).join(", ") + "]";

// --- mesh-level invariants --------------------------------------------------

function stats(u) {
  const p = u.positions;
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.length; i += 3)
    for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k], p[i + k]); hi[k] = Math.max(hi[k], p[i + k]);
    }
  return { lo, hi, tris: p.length / 9 };
}

// every directed edge must have exactly one opposite twin: closed 2-manifold
function closed(u) {
  const q = (i) => {
    const p = u.positions;
    return [0, 1, 2].map((k) => Math.round(p[i + k] * 1e5)).join(",");
  };
  const edges = new Map();
  const p = u.positions;
  for (let t = 0; t < p.length; t += 9) {
    const v = [q(t), q(t + 3), q(t + 6)];
    for (let k = 0; k < 3; k++) {
      const a = v[k], b = v[(k + 1) % 3];
      if (a === b) return { ok: false, why: `degenerate edge in tri ${t / 9}` };
      edges.set(a + "|" + b, (edges.get(a + "|" + b) || 0) + 1);
    }
  }
  for (const [k, n] of edges) {
    if (n !== 1) return { ok: false, why: `directed edge ${k} used ${n}x (non-manifold)` };
    const [a, b] = k.split("|");
    if (!edges.has(b + "|" + a)) return { ok: false, why: `edge ${k} has no opposite twin (hole)` };
  }
  return { ok: true, why: "" };
}

// do the stored normals agree with the winding everywhere?
function normalsOutward(u) {
  const p = u.positions, n = u.normals;
  let worst = 1;
  for (let t = 0; t < p.length; t += 9) {
    const a = [p[t], p[t + 1], p[t + 2]];
    const b = [p[t + 3], p[t + 4], p[t + 5]];
    const c = [p[t + 6], p[t + 7], p[t + 8]];
    const g = vNorm(vCross(vSub(b, a), vSub(c, a)));
    for (let k = 0; k < 3; k++) {
      const nk = [n[t + k * 3], n[t + k * 3 + 1], n[t + k * 3 + 2]];
      worst = Math.min(worst, g[0] * nk[0] + g[1] * nk[1] + g[2] * nk[2]);
    }
  }
  return worst;
}

function checkSolid(label, h, dims) {
  const u = h.unit;
  const s = stats(u);
  ok(`${label}: unit mesh is bbox-centred 1x1x1`,
    nearV(s.lo, [-0.5, -0.5, -0.5], 1e-3) && nearV(s.hi, [0.5, 0.5, 0.5], 1e-3),
    `lo=${fmt(s.lo)} hi=${fmt(s.hi)}`);
  ok(`${label}: positive signed volume (outward, not inside-out)`,
    M.signedVolume(u.positions) > 1e-6, `vol=${M.signedVolume(u.positions)}`);
  const c = closed(u);
  ok(`${label}: closed 2-manifold`, c.ok, c.why);
  const w = normalsOutward(u);
  ok(`${label}: every triangle's winding agrees with its normal`, w > 0, `worst dot=${w.toFixed(4)}`);

  // the dimensioned solid's bbox must be exactly w x h x d, centred on the origin
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  const v = new THREE.Vector3();
  for (let i = 0; i < u.positions.length; i += 3) {
    v.set(u.positions[i], u.positions[i + 1], u.positions[i + 2]).applyMatrix4(h.matrix);
    const a = v.toArray();
    for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], a[k]); hi[k] = Math.max(hi[k], a[k]); }
  }
  const ext = vSub(hi, lo), ctr = vScale(vAdd(hi, lo), 0.5);
  ok(`${label}: sized bbox = ${fmt(dims)}`, nearV(ext, dims, 1e-3), `got ${fmt(ext)}`);
  ok(`${label}: origin is the bbox centre`, nearV(ctr, [0, 0, 0], 1e-3), `centre ${fmt(ctr)}`);
  return { lo, hi };
}

// a face must be a right-handed frame that sits on the hull, looking out
function checkFace(label, h, f, bb) {
  ok(`${label}: |n|=|u|=|v|=1`,
    near(vLen(f.n), 1) && near(vLen(f.u), 1) && near(vLen(f.v), 1));
  ok(`${label}: u x v = n`, nearV(vCross(f.u, f.v), f.n), `got ${fmt(vCross(f.u, f.v))} want ${fmt(f.n)}`);
  ok(`${label}: orthonormal`, near(f.u[0] * f.n[0] + f.u[1] * f.n[1] + f.u[2] * f.n[2], 0));
  ok(`${label}: faces outward`, f.pos[0] * f.n[0] + f.pos[1] * f.n[1] + f.pos[2] * f.n[2] > -1e-6,
    `pos ${fmt(f.pos)} n ${fmt(f.n)}`);
  if (bb) {
    const inside = f.pos.every((x, k) => x >= bb.lo[k] - 1e-3 && x <= bb.hi[k] + 1e-3);
    ok(`${label}: pos lies on the solid`, inside, `pos ${fmt(f.pos)}`);
  }
  ok(`${label}: has a section`, !!f.sec && !!f.sec.kind);
}

console.log("=== cores ===");

// ---- box -------------------------------------------------------------------
{
  const b = M.box(2, 1, 3);
  const bb = checkSolid("box(2,1,3)", b, [2, 1, 3]);
  for (const n of ["top", "bottom", "left", "right", "front", "back"])
    checkFace(`box.${n}`, b, b.face(n), bb);

  const t = b.face("top");
  ok("box.top: n = +Y", nearV(t.n, [0, 1, 0]), fmt(t.n));
  ok("box.top: pos = (0, h/2, 0)", nearV(t.pos, [0, 0.5, 0]), fmt(t.pos));
  ok("box.top: sec = rect(w=2, d=3)", t.sec.kind === "rect" && near(t.sec.w, 2) && near(t.sec.d, 3),
    JSON.stringify(t.sec));
  const r = b.face("right");
  ok("box.right: sec = rect(h=1, d=3)", r.sec.kind === "rect" && near(r.sec.w, 1) && near(r.sec.d, 3),
    JSON.stringify(r.sec));
  const fr = b.face("front");
  ok("box.front: sec = rect(w=2, h=1)", fr.sec.kind === "rect" && near(fr.sec.w, 2) && near(fr.sec.d, 1),
    JSON.stringify(fr.sec));
  ok("box: inradius(top) = 1", near(M.inradius(t.sec), 1));

  // identity: same proportions + size = same id AND the same shared unit mesh
  ok("box: identical proportions share one unit mesh", M.box(2, 1, 3).unit === b.unit);
  ok("box: identity = proportions + size", M.box(2, 1, 3).id === b.id && M.box(2, 1, 4).id !== b.id);
  ok("box: pure scale — size does NOT fork the unit mesh", M.box(9, 9, 9).unit === b.unit);
}

// ---- box with slope / curve -------------------------------------------------
for (const [slope, curve] of [[0.5, 0], [1, 0], [0.4, 0.9], [0.4, -0.9], [0, 0.8]]) {
  const label = `box(slope=${slope},curve=${curve})`;
  const b = M.box(2, 1, 3, { slope, curve });
  const bb = checkSolid(label, b, [2, 1, 3]);
  const t = b.face("top");
  checkFace(`${label}.top`, b, t, bb);
  if (slope > 0) {
    ok(`${label}: top tilts toward +Z (the dropped edge)`, t.n[2] > 1e-6, `n=${fmt(t.n)}`);
    const fr = b.face("front");
    ok(`${label}: +Z wall is shorter than h`, fr.sec.d < 1 - 1e-6, `front h=${fr.sec.d}`);
    // a convex bend is the highest point of the solid, so the -Z corner then sits
    // below the top of the bounding box; without one, that corner IS the top.
    if (curve <= 0)
      ok(`${label}: -Z wall is full height`, near(b.face("back").sec.d, 1), `back h=${b.face("back").sec.d}`);
  }
  ok(`${label}: proportions fork the unit mesh`, b.unit !== M.box(2, 1, 3).unit);
}

// ---- cylinder ---------------------------------------------------------------
{
  const c = M.cylinder(0.5, 2, "y");
  const bb = checkSolid("cylinder(0.5,2,y)", c, [1, 2, 1]);
  const t = c.face("top"), bo = c.face("bottom");
  checkFace("cyl.top", c, t, bb);
  checkFace("cyl.bottom", c, bo, bb);
  ok("cyl.top: n = +Y, pos = (0,1,0)", nearV(t.n, [0, 1, 0]) && nearV(t.pos, [0, 1, 0]));
  ok("cyl.top: sec = disc(0.5)", t.sec.kind === "disc" && near(t.sec.r, 0.5), JSON.stringify(t.sec));
  ok("cyl: cap0/cap1 alias the caps", nearV(c.face("cap0").n, t.n) && nearV(c.face("cap1").n, bo.n));
  ok("cyl: inradius(disc) = r", near(M.inradius(t.sec), 0.5));

  for (const a of [0, HPI, Math.PI, -HPI, 0.7]) {
    const s = c.face("side", a);
    checkFace(`cyl.side(${a.toFixed(2)})`, c, s, bb);
    ok(`cyl.side(${a.toFixed(2)}): sits on the barrel (|pos_r| = r)`,
      near(Math.hypot(s.pos[0], s.pos[2]), 0.5), `r=${Math.hypot(s.pos[0], s.pos[2])}`);
    ok(`cyl.side(${a.toFixed(2)}): n is radial`, near(s.n[1], 0) && near(vLen(s.n), 1));
    ok(`cyl.side(${a.toFixed(2)}): u is the barrel axis`, nearV(s.u, [0, 1, 0]), fmt(s.u));
    ok(`cyl.side(${a.toFixed(2)}): sec = rect(h, 2r)`, near(s.sec.w, 2) && near(s.sec.d, 1));
  }

  // axis is a rigid transform, not a proportion
  const cx = M.cylinder(0.5, 2, "x");
  checkSolid("cylinder(0.5,2,x)", cx, [2, 1, 1]);
  ok("cyl: axis does not fork the unit mesh", cx.unit === c.unit);
  ok("cyl: axis does not fork the identity", cx.id === c.id);
  ok("cyl(x): caps are named right/left", nearV(cx.face("right").n, [1, 0, 0]) && nearV(cx.face("left").n, [-1, 0, 0]));
  const cz = M.cylinder(0.5, 2, "z");
  checkSolid("cylinder(0.5,2,z)", cz, [1, 1, 2]);
  ok("cyl(z): caps are named front/back", nearV(cz.face("front").n, [0, 0, 1]));
  ok("cyl(z).side: u is the barrel axis", nearV(cz.face("side", 0.3).u, [0, 0, 1]));
}

// ---- halfCylinder -----------------------------------------------------------
{
  const hc = M.halfCylinder(0.5, 2, "y", "-z");
  const bb = checkSolid("halfCylinder(0.5,2,y,-z)", hc, [1, 2, 0.5]);
  const t = hc.face("top"), bo = hc.face("bottom"), fl = hc.face("flat");
  checkFace("hcyl.top", hc, t, bb);
  checkFace("hcyl.bottom", hc, bo, bb);
  ok("hcyl.top: sec = halfDisc(0.5)", t.sec.kind === "halfDisc" && near(t.sec.r, 0.5), JSON.stringify(t.sec));
  ok("hcyl: inradius(halfDisc) = r/2", near(M.inradius(t.sec), 0.25));
  ok("hcyl.flat: n opposes the bulge (+Z)", nearV(fl.n, [0, 0, 1]), fmt(fl.n));
  ok("hcyl.flat: sits at +r/2 (bbox-centred)", near(fl.pos[2], 0.25), fmt(fl.pos));
  ok("hcyl.flat: sec = rect(h, 2r)", fl.sec.kind === "rect" && near(fl.sec.w, 2) && near(fl.sec.d, 1));
  // the apex is at +v for the +axis cap and -v for the -axis cap: seat mates them
  ok("hcyl.top: halfDisc apex is at +v", nearV(t.v, [0, 0, -1]), fmt(t.v));
  ok("hcyl.bottom: halfDisc apex is at -v", nearV(bo.v, [0, 0, 1]), fmt(bo.v));

  const s0 = hc.face("side", 0);
  ok("hcyl.side(0): sits on the apex", nearV(s0.pos, [0, 0, -0.25]), fmt(s0.pos));
  ok("hcyl.side(0): n = the bulge dir", nearV(s0.n, [0, 0, -1]), fmt(s0.n));
  checkFace("hcyl.side(0)", hc, s0, bb);
  checkFace("hcyl.side(+90)", hc, hc.face("side", HPI), bb);
  checkFace("hcyl.side(-60)", hc, hc.face("side", -Math.PI / 3), bb);
  let threw = false;
  try { hc.face("side", Math.PI); } catch { threw = true; }
  ok("hcyl.side: an angle off the curved half throws", threw);

  const hx = M.halfCylinder(0.5, 2, "x", "+y");
  checkSolid("halfCylinder(0.5,2,x,+y)", hx, [2, 0.5, 1]);
  ok("hcyl: axis/round do not fork the unit mesh", hx.unit === hc.unit);
  ok("hcyl(x,+y): bulges +Y", nearV(hx.face("side", 0).n, [0, 1, 0]), fmt(hx.face("side", 0).n));
  ok("hcyl(x,+y): flat looks -Y", nearV(hx.face("flat").n, [0, -1, 0]), fmt(hx.face("flat").n));
}

// ---- extrude / lathe direct --------------------------------------------------
{
  const tri = M.extrude([[-1, -0.5], [1, -0.5], [0, 0.5]], 2);
  checkSolid("extrude(triangle, 2)", tri, [2, 1, 2]);
  const ring = M.lathe([[0.5, -0.2], [1, -0.2], [1, 0.2, true], [0.5, 0.2]], TAU);
  checkSolid("lathe(tube, TAU)", ring, [2, 0.4, 2]);
  const half = M.lathe([[0, -0.5], [0.5, -0.5], [0.5, 0.5], [0, 0.5]], Math.PI);
  checkSolid("lathe(rect, PI)", half, [1, 1, 0.5]);
  // a CW outline is wound back to CCW rather than producing an inside-out solid
  const cw = M.extrude([[0, 0.5], [1, -0.5], [-1, -0.5]], 2);
  ok("extrude: a CW outline still yields a positive-volume solid",
    M.signedVolume(cw.unit.positions) > 0);

  // an outline that is not star-shaped about its centroid is rejected, not fanned
  // into backwards triangles
  let threw = false;
  try {
    M.extrude([[-1, -1], [1, -1], [1, 1], [0, -0.8], [-1, 1]], 1);
  } catch { threw = true; }
  ok("extrude: a non-star-shaped outline throws", threw);

  // smooth points average their two edges; crisp ones keep the rim
  const crisp = M.extrude([[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]], 1);
  const round = M.extrude(
    [[-0.5, -0.5, true], [0.5, -0.5, true], [0.5, 0.5, true], [-0.5, 0.5, true]], 1);
  ok("extrude: same outline, different smooth flags = different unit meshes",
    crisp.unit !== round.unit);
  const axisAligned = (n) => n.filter((x) => Math.abs(x) > 1e-3).length === 1;
  const wallNormals = (u) => {
    const out = [];
    for (let i = 0; i < u.normals.length; i += 3) {
      const n = [u.normals[i], u.normals[i + 1], u.normals[i + 2]];
      if (Math.abs(n[2]) < 0.99) out.push(n); // skip the caps
    }
    return out;
  };
  ok("extrude: a crisp rim keeps each wall's own normal",
    wallNormals(crisp.unit).every(axisAligned));
  ok("extrude: a smooth point averages its two edges (45 degrees at a square's corner)",
    wallNormals(round.unit).every((n) => near(Math.abs(n[0]), Math.SQRT1_2, 1e-3)
      && near(Math.abs(n[1]), Math.SQRT1_2, 1e-3)));
}

console.log("=== sections & plates ===");
{
  ok("rect/disc/halfDisc constructors",
    M.rect(2, 3).kind === "rect" && M.disc(1).kind === "disc" && M.halfDisc(1).kind === "halfDisc");
  ok("inradius(rect) = min/2", near(M.inradius(M.rect(2, 3)), 1));

  const pr = M.plate(M.rect(2, 3), 0.2);
  checkSolid("plate(rect(2,3), 0.2)", pr, [2, 0.2, 3]);
  const prt = pr.face("top");
  ok("plate(rect).top sec = the section it was cut from",
    prt.sec.kind === "rect" && near(prt.sec.w, 2) && near(prt.sec.d, 3), JSON.stringify(prt.sec));

  const pd = M.plate(M.disc(0.7), 0.2);
  checkSolid("plate(disc(0.7), 0.2)", pd, [1.4, 0.2, 1.4]);
  ok("plate(disc).top sec = disc(0.7)", pd.face("top").sec.kind === "disc" && near(pd.face("top").sec.r, 0.7));

  const ph = M.plate(M.halfDisc(0.6), 0.2);
  checkSolid("plate(halfDisc(0.6), 0.2)", ph, [1.2, 0.2, 0.6]);
  ok("plate(halfDisc).top sec = halfDisc(0.6)",
    ph.face("top").sec.kind === "halfDisc" && near(ph.face("top").sec.r, 0.6));
}

console.log("=== seat ===");
{
  // seat lays B's face flat on A's: origins coincide, u aligns, normals oppose
  const cases = [
    ["box.top <- cyl.bottom", M.box(2, 1, 3).face("top"), M.cylinder(0.4, 1, "y").face("bottom"), 0],
    ["box.right <- box.left", M.box(2, 1, 3).face("right"), M.box(1, 1, 1).face("left"), 0.1],
    ["sloped top <- plate", M.box(2, 1, 3, { slope: 0.5 }).face("top"), M.plate(M.rect(1, 1), 0.2).face("bottom"), 0],
    ["cyl.side <- disc plate", M.cylinder(0.5, 2, "y").face("side", 0.9), M.plate(M.disc(0.3), 0.1).face("bottom"), 0.05],
    ["hcyl.top <- hcyl.bottom", M.halfCylinder(0.5, 1, "y", "-z").face("top"), M.halfCylinder(0.5, 0.4, "y", "-z").face("bottom"), 0],
    ["x-cyl.right <- box.top", M.cylinder(0.5, 2, "x").face("right"), M.box(1, 1, 1).face("top"), 0.2],
  ];
  for (const [name, a, b, gap] of cases) {
    const T = M.seat(a, b, gap);
    const nb = M.transformFace(b, T);
    ok(`seat ${name}: origins coincide (+gap along nA)`,
      nearV(nb.pos, vAdd(a.pos, vScale(a.n, gap))), `${fmt(nb.pos)} vs ${fmt(vAdd(a.pos, vScale(a.n, gap)))}`);
    ok(`seat ${name}: normals oppose`, nearV(nb.n, vScale(a.n, -1)), `${fmt(nb.n)} vs ${fmt(vScale(a.n, -1))}`);
    ok(`seat ${name}: u axes align`, nearV(nb.u, a.u), `${fmt(nb.u)} vs ${fmt(a.u)}`);
    ok(`seat ${name}: rigid (det = +1, orthonormal)`,
      near(new THREE.Matrix4().extractRotation(T).determinant(), 1));
    ok(`seat ${name}: B lies flat on A (its plane is A's plane)`,
      near(vSub(nb.pos, a.pos)[0] * a.u[0] + vSub(nb.pos, a.pos)[1] * a.u[1] + vSub(nb.pos, a.pos)[2] * a.u[2], 0));
  }

  // the seated SOLID must actually rest on the host's face, not intersect it
  const host = M.box(2, 1, 3);
  const cap = M.cylinder(0.4, 0.6, "y");
  const T = M.seat(host.face("top"), cap.face("bottom"), 0);
  const v = new THREE.Vector3();
  let minY = Infinity, maxYbelow = -Infinity;
  const Mfull = T.clone().multiply(cap.matrix);
  for (let i = 0; i < cap.unit.positions.length; i += 3) {
    v.set(cap.unit.positions[i], cap.unit.positions[i + 1], cap.unit.positions[i + 2]).applyMatrix4(Mfull);
    minY = Math.min(minY, v.y); maxYbelow = Math.max(maxYbelow, v.y);
  }
  ok("seat: the seated solid's lowest point rests exactly on the host face",
    near(minY, 0.5, 1e-3), `minY=${minY}`);
  ok("seat: the seated solid stands on top (h above the face)", near(maxYbelow, 1.1, 1e-3), `maxY=${maxYbelow}`);

  // a plate cut from a halfDisc face lands apex-to-apex on it (seat opposes normals,
  // which flips v, and the two caps' apexes sit on opposite v — so they mate)
  const hh = M.halfCylinder(0.5, 1, "y", "-z");
  const hf = hh.face("top");
  const hp = M.plate(hf.sec, 0.2);
  const HT = M.seat(hf, hp.face("bottom"), 0);
  const apex = M.transformFace(hp.face("side", 0), HT); // the plate's curved apex
  ok("seat: a halfDisc plate's apex lands on the host's apex",
    nearV(apex.n, [0, 0, -1], 1e-3), `apex n=${fmt(apex.n)}`);
  ok("seat: a halfDisc plate's flat back lands on the host's flat back",
    nearV(M.transformFace(hp.face("flat"), HT).n, [0, 0, 1], 1e-3));
}

console.log("=== parts ===");
{
  // a leg: thigh, a foot joined to its bottom, a knee anchor, a hip mount
  const thigh = M.piece(M.box(0.6, 2, 0.6));
  const foot = M.join(thigh, "bottom", M.box(0.8, 0.2, 1.2), "top", { gap: 0, v: 0.5 });
  M.anchor("knee", thigh, "front");
  M.mount(thigh, "top", { round: true, scale: 0.8 });
  const part = M.finish();

  ok("finish: returns the part's meshes", part.meshes.length === 2);
  ok("finish: returns its anchors", !!part.anchors.knee);
  ok("finish: returns its plug section", !!part.sec && part.sec.kind === "disc");
  ok("mount round: sec = disc(inradius * scale)", near(part.sec.r, 0.3 * 0.8), JSON.stringify(part.sec));
  ok("finish: the mount face is the origin", nearV(part.plug.pos, [0, 0, 0]), fmt(part.plug.pos));
  ok("finish: the mount normal is +Y", nearV(part.plug.n, [0, 1, 0]), fmt(part.plug.n));

  // the body hangs -Y
  const bb = { lo: [Infinity, Infinity, Infinity], hi: [-Infinity, -Infinity, -Infinity] };
  const v = new THREE.Vector3();
  for (const m of part.meshes) {
    const g = m.geometry.getAttribute("position");
    for (let i = 0; i < g.count; i++) {
      v.fromBufferAttribute(g, i).applyMatrix4(m.matrix);
      for (let k = 0; k < 3; k++) {
        bb.lo[k] = Math.min(bb.lo[k], v.getComponent(k));
        bb.hi[k] = Math.max(bb.hi[k], v.getComponent(k));
      }
    }
  }
  ok("finish: the body hangs -Y (nothing above the mount)", bb.hi[1] <= 1e-3, `maxY=${bb.hi[1]}`);
  ok("finish: the body reaches down 2 + 0.2", near(bb.lo[1], -2.2, 1e-3), `minY=${bb.lo[1]}`);
  ok("finish: FORWARD preserved (+Z still +Z)", nearV(part.anchors.knee.n, [0, 0, 1]), fmt(part.anchors.knee.n));
  ok("join: v-slide moved the foot +Z by half the host face's half-depth",
    near((bb.lo[2] + bb.hi[2]) / 2, 0.15, 1e-3), `zc=${(bb.lo[2] + bb.hi[2]) / 2}`);

  // FORWARD: a part mounted by a SIDE face keeps +Z pointing +Z. `fwd` is the boss
  // that already looks +Z; aligning the mount's `u` instead would spin it sideways.
  const drum = M.piece(M.cylinder(0.5, 1.4, "y"));
  M.anchor("fwd", drum, "side", HPI);   // n = +Z before the re-base
  M.mount(drum, "side", { angle: 0 });  // n = +X before the re-base
  const p2 = M.finish();
  ok("finish(side mount): the mount normal is +Y", nearV(p2.plug.n, [0, 1, 0]), fmt(p2.plug.n));
  ok("finish(side mount): FORWARD preserved — a +Z anchor still looks +Z",
    nearV(p2.anchors.fwd.n, [0, 0, 1]), `fwd n=${fmt(p2.anchors.fwd.n)}`);

  // and the ordinary case: a part mounted by its BOTTOM must not flip forward to -Z
  const trunk = M.piece(M.box(1, 2, 1));
  M.anchor("face", trunk, "front");
  M.mount(trunk, "bottom");
  const p5 = M.finish();
  ok("finish(bottom mount): the mount normal is +Y", nearV(p5.plug.n, [0, 1, 0]), fmt(p5.plug.n));
  ok("finish(bottom mount): FORWARD preserved — front still looks +Z",
    nearV(p5.anchors.face.n, [0, 0, 1]), `front n=${fmt(p5.anchors.face.n)}`);

  // flush: a foot's sole stays one plane with the host's sole
  const shin = M.piece(M.box(0.5, 2, 0.5));
  const heel = M.join(shin, "front", M.box(0.4, 0.4, 0.4), "back", { flush: "bottom" });
  M.mount(shin, "top");
  const p3 = M.finish();
  const sole = shin.face("bottom").pos[1], hsole = heel.face("bottom").pos[1];
  ok("join flush: both soles lie in one plane", near(sole, hsole, 1e-4), `${sole} vs ${hsole}`);

  // a part with no mount still finishes (a root piece)
  M.piece(M.box(1, 1, 1));
  const p4 = M.finish();
  ok("finish: a part with no mount is allowed (a root)", p4.meshes.length === 1 && p4.sec === null);
}

console.log("=== exports (the joint engine's contract) ===");
for (const n of ["extrude", "lathe", "box", "cylinder", "halfCylinder", "rect", "disc",
  "halfDisc", "inradius", "plate", "seat", "piece", "join", "anchor", "mount", "finish"])
  ok(`export ${n}`, typeof M[n] === "function");

const fh = M.box(1, 1, 1).face("top");
ok("face has {pos, n, u, v, sec}",
  ["pos", "n", "u", "v", "sec"].every((k) => fh[k] !== undefined));

console.log("=== demo (shapes tab group) ===");
{
  const { subjects } = await import("./demo-shapes.js");
  ok("demo: one tab per core", subjects.length === 3
    && subjects.every((s) => s.kind === "shapes"), subjects.map((s) => s.name).join(","));
  for (const s of subjects) {
    const scene = new THREE.Scene();
    const built = s.build(scene);
    ok(`demo ${s.name}: builds a subject with channels + pose`,
      built.channels.length > 0 && built.channels.every((c) => typeof built.pose[c.key] === "number"));
    ok(`demo ${s.name}: puts something in the scene`, scene.children.length > 0);
    // sweep every slider across its range: no param combination may throw
    let threw = "";
    try {
      for (const c of built.channels)
        for (let i = 0; i <= 8; i++) {
          built.pose[c.key] = c.min + ((c.max - c.min) * i) / 8;
          built.update();
        }
    } catch (e) { threw = e.message; }
    ok(`demo ${s.name}: every slider position rebuilds cleanly`, !threw, threw);
    built.dispose();
    ok(`demo ${s.name}: disposes`, scene.children.length === 0);
  }
}

console.log("");
for (const f of fails) console.log("FAIL  " + f);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
