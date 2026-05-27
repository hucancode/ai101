import { json } from '@sveltejs/kit';
import { getState } from '$lib/server/queue';
import type { BodyInfo, RobotState, Tray } from '$lib/robot/types';
import type { RequestHandler } from './$types';

const GRIPPER_CLOSED_MAX = 120;
const WORKSPACE = { x: [0.2, 0.7], y: [-0.4, 0.4], z: [0.02, 0.6], table_z: 0 };

function summarizeCube(b: BodyInfo) {
  const g = b.geoms[0];
  return {
    name: b.name,
    pos: b.pos,
    size: g ? g.size : [0, 0, 0],
    rgba: g ? g.rgba : [0, 0, 0, 1]
  };
}

function cubeInTray(c: BodyInfo, t: Tray): boolean {
  const g = c.geoms[0];
  if (!g) return false;
  const [cx, cy, cz] = c.pos, [csx, csy, csz] = g.size;
  const [tx, ty, tz] = t.pos, [tsx, tsy, tsz] = t.size;
  if (cx - csx < tx - tsx || cx + csx > tx + tsx) return false;
  if (cy - csy < ty - tsy || cy + csy > ty + tsy) return false;
  const topZ = tz + tsz;
  return cz - csz >= topZ - 0.005 && cz <= topZ + 0.5;
}

function findHeld(cubes: BodyInfo[], ee: [number, number, number], gripper: number | null) {
  if (gripper == null || gripper > GRIPPER_CLOSED_MAX) return null;
  const [ex, ey, ez] = ee;
  let best: { cube: BodyInfo; d: number } | null = null;
  for (const c of cubes) {
    const g = c.geoms[0];
    if (!g) continue;
    const [cx, cy, cz] = c.pos, [sx, sy, sz] = g.size;
    const dxy = Math.hypot(cx - ex, cy - ey);
    if (dxy > Math.max(sx, sy)) continue;
    if (ez - cz > sz + 0.01) continue;
    if (cz - ez > sz * 2.0) continue;
    const d = dxy + Math.abs(cz - ez);
    if (!best || d < best.d) best = { cube: c, d };
  }
  return best ? summarizeCube(best.cube) : null;
}

function buildWorld(state: RobotState | null): Record<string, unknown> {
  if (!state) {
    return { cubes: [], trays: [], ee: null, gripper: null,
             holding: null, idle: false, workspace: WORKSPACE };
  }
  const cubeBodies = state.bodies.filter(b => b.name.startsWith('cube'));
  return {
    cubes: cubeBodies.map((b, i) => ({ index: i, ...summarizeCube(b) })),
    trays: state.trays.map(t => ({
      name: t.name,
      pos: t.pos,
      size: t.size,
      cubes: cubeBodies.filter(c => cubeInTray(c, t)).map(summarizeCube)
    })),
    ee: state.ee.pos,
    gripper: state.gripper,
    holding: findHeld(cubeBodies, state.ee.pos, state.gripper),
    idle: state.idle,
    workspace: WORKSPACE
  };
}

export const GET: RequestHandler = async ({ url }) => {
  const world = buildWorld(getState().state);
  const fields = url.searchParams.get('fields')?.split(',').map(s => s.trim()).filter(Boolean);
  if (!fields) return json(world);
  const out: Record<string, unknown> = {};
  for (const k of fields) if (k in world) out[k] = world[k];
  return json(out);
};
