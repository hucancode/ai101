// joints tab group — one tab per mechanism.
//
// Each tab hangs a child limb off a parent limb by a joint. The sliders drive the moving
// half in DEGREES while the fixed half holds; the `plug` slider resizes the CHILD'S PLUG
// SECTION and every piece of hardware resizes with the limb, because the plug section is
// the only dimension a joint is ever given.
//
// Overlaid: the anchor face, the rotation centre, and the seat / reach spans.

import { THREE, rad, colorOf, group, attachMesh } from "./gfx.js";
import { box, plate, rect, disc } from "./engines/modeling.js";
import { build } from "./engines/joint.js";

const PARENT = { w: 1.1, h: 1.3, d: 0.9 };
const CHILD_LEN = 1.4;

const ANCHOR_COL = 0x7dcb2f;   // the face the joint seats on
const CENTRE_COL = 0xf1c40f;   // the rotation centre
const SEAT_COL = 0xe67e22;     // anchor -> centre
const REACH_COL = 0x3498db;    // centre -> the child's root

const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);

function lines(pts, color) {
  const g = new THREE.BufferGeometry().setFromPoints(pts.map(v3));
  return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color }));
}
function loop(pts, color) {
  const g = new THREE.BufferGeometry().setFromPoints(pts.map(v3));
  return new THREE.LineLoop(g, new THREE.LineBasicMaterial({ color }));
}
// a 3-axis crosshair, so the rotation centre reads as a point in space
function cross(p, r, color) {
  const seg = [];
  for (let a = 0; a < 3; a++) {
    const lo = [...p], hi = [...p];
    lo[a] -= r; hi[a] += r;
    seg.push(lo, hi);
  }
  return lines(seg, color);
}

// the plug section, at the size the slider asks for
const sectionOf = (kind, s) =>
  kind === "ball" ? disc(0.30 * s) : rect(0.62 * s, 0.42 * s);

function subject(kind, name, opts, caption) {
  return {
    kind: "joints",
    name,
    build(scene) {
      const root = new THREE.Group();
      scene.add(root);

      let live = null;       // { joint, nodes, child, reachLine }
      let builtAt = null;    // the quantised plug size the scene was built at

      // A rebuild only happens when the plug CHANGES size — and the size is quantised, so
      // a slider drag (or the choreographer sweeping the channel) cannot spin up an
      // unbounded number of distinct unit meshes in the modeling engine's cache.
      function rebuild(s) {
        for (let i = root.children.length - 1; i >= 0; i--) root.remove(root.children[i]);

        const sec = sectionOf(kind, s);
        const parent = box(PARENT.w, PARENT.h, PARENT.d);
        const anchor = parent.face("bottom");          // NAME a face — never a position
        const j = build(kind, anchor, sec, opts);

        attachMesh(root, parent.mesh(), colorOf(parent.id, 3));

        // the bone chain: offset + static rest come straight off the joint, so the rig
        // computes no position and no rotation of its own
        const nodes = {};
        let node = root;
        for (const b of j.bones) node = nodes[b.name] = group(node, b.offset, b.rest);
        const child = group(node, j.child.offset, j.child.rest);

        // the child limb IS its plug section, extruded: the joint's plates land on it exactly
        const limb = plate(sec, CHILD_LEN);
        attachMesh(child, limb.mesh(), colorOf(limb.id, 3), [0, -CHILD_LEN / 2, 0]);

        // the hardware, already placed in the frame it belongs to
        for (const h of j.hardware)
          attachMesh(h.bone ? nodes[h.bone] : root, h.mesh, colorOf(h.id ?? h.name, 3));

        // --- overlays ---
        const [pw, pd] = [PARENT.w / 2, PARENT.d / 2];
        const y = anchor.pos[1];
        root.add(loop([[-pw, y, -pd], [pw, y, -pd], [pw, y, pd], [-pw, y, pd]], ANCHOR_COL));
        root.add(cross(j.centre, 0.09, CENTRE_COL));
        root.add(lines([anchor.pos, j.centre], SEAT_COL));                 // the seat span
        const reachLine = lines([j.centre, j.centre], REACH_COL);          // the reach span, live
        root.add(reachLine);

        live = { joint: j, nodes, child, reachLine };
        builtAt = s;
        return j;
      }

      const j0 = rebuild(1);
      const pose = { plug: 1 };
      const channels = [{ key: "plug", min: 0.55, max: 1.6 }];
      for (const b of j0.bones) {
        pose[b.name] = 0;
        channels.push({ key: b.name, min: -90, max: 90 });
      }

      return {
        channels,
        pose,
        caption,
        update() {
          const s = Math.round(pose.plug / 0.05) * 0.05;   // quantised: bounded rebuilds
          if (s !== builtAt) rebuild(s);

          // pose every bone about its own local axis, by SIGN x the channel's degrees
          for (const b of live.joint.bones)
            live.nodes[b.name].quaternion.setFromAxisAngle(
              v3(b.axis), rad(b.sign * (pose[b.name] ?? 0)),
            );

          // the reach span, drawn live from the centre to the child's root wherever it swings
          root.updateMatrixWorld(true);
          const p = live.child.getWorldPosition(new THREE.Vector3()).sub(root.position);
          live.reachLine.geometry.setFromPoints([v3(live.joint.centre), p]);
        },
        dispose() {
          scene.remove(root);
        },
      };
    },
  };
}

export const subjects = [
  subject("hinge", "hinge", { name: "elbow" },
    "hinge — 1 pin. seat = body + plate, reach = body + plate: both read off the pieces, so the gap between the parent's surface and the child's is algebraically zero."),
  subject("hinge", "hinge + collar", { name: "shoulder", collar: true },
    "collar — a spin about the anchor normal, in a seat plate the parent holds. The clevis turns on the collar bone; the seat plate does not, so the seat grows by exactly one plate."),
  subject("ball", "ball", { name: "hip" },
    "ball — a socket, 3 axes, no corner. hole < ball < inner < outer <= R, shaft < hole, drop > ball: the asserts, not the prose, are what make it fit."),
  subject("universal", "universal", { name: "wrist" },
    "universal — two hinges at right angles. The second's clevis hangs off the first's tongue plate and they SHARE it: 3 plates, not 4. One joint to the caller, two bones to the rig (three with a collar)."),
  subject("hinge", "hinge, aimed against", { name: "fold", aim: "against" },
    "aim — a corner is expressed by aiming, never by a re-seat rotation. \"against\" opposes the parent's body, so the child folds back up it; the seating rule does not change one line."),
];
