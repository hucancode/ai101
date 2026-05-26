import { json } from '@sveltejs/kit';
import { getState } from '$lib/server/queue';
import type { BodyInfo } from '$lib/robot/types';
import type { RequestHandler } from './$types';

function summarize(b: BodyInfo) {
  const g = b.geoms[0];
  return {
    name: b.name,
    pos: b.pos,
    quat: b.quat,
    size: g ? g.size : [0, 0, 0],
    rgba: g ? g.rgba : [0, 0, 0, 1],
    geomType: g ? g.type : -1
  };
}

// Gripper actuator convention: 0 = fully closed, 255 = fully open.
// Only consider "gripping" when jaws are mostly closed.
const GRIPPER_CLOSED_MAX = 120;

// Cube held between gripper jaws. Requires:
//  - jaws mostly closed
//  - ee XY over the cube footprint (small slack for finger geometry)
//  - ee Z within ~one cube above the cube's center (TCP sits near the top of a grasped cube,
function findGripped(
  cubes: BodyInfo[],
  ee: [number, number, number],
  gripper: number | null | undefined
) {
  if (gripper == null || gripper > GRIPPER_CLOSED_MAX) return null;
  const [ex, ey, ez] = ee;
  let best: { cube: BodyInfo; d: number } | null = null;
  for (const c of cubes) {
    const g = c.geoms[0];
    if (!g) continue;
    const [cx, cy, cz] = c.pos;
    const [sx, sy, sz] = g.size;
    const dxy = Math.hypot(cx - ex, cy - ey);
    if (dxy > Math.max(sx, sy)) continue;
    // Z is asymmetric: TCP may sit at the cube's top face (real grasp pose), but not
    // hover any meaningful distance above it.
    const dzAbove = ez - cz;            // positive when EE is above cube center
    const dzBelow = cz - ez;            // positive when EE is below cube center
    if (dzAbove > sz + 0.01) continue;  // hovering above the cube, not gripping
    if (dzBelow > sz * 2.0) continue;   // EE too far below cube
    const d = dxy + Math.abs(cz - ez);
    if (!best || d < best.d) best = { cube: c, d };
  }
  return best ? summarize(best.cube) : null;
}

export const GET: RequestHandler = async () => {
  const { state, staleMs } = getState();
  if (!state) return json({ gripping: null, gripper: null, staleMs });
  const cubes = state.bodies.filter(b => b.name.startsWith('cube'));
  const gripping = findGripped(cubes, state.ee.pos, state.gripper);
  return json({ gripping, gripper: state.gripper, ee: state.ee.pos, staleMs });
};
