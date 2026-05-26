import { json } from '@sveltejs/kit';
import { getState } from '$lib/server/queue';
import type { BodyInfo, Tray } from '$lib/robot/types';
import type { RequestHandler } from './$types';

// AABB containment in XY plane; Z above tray top within tolerance.
function cubeInTray(cube: BodyInfo, tray: Tray, tol = 0.01): boolean {
  const g = cube.geoms[0];
  if (!g) return false;
  const [cx, cy, cz] = cube.pos;
  const [tx, ty, tz] = tray.pos;
  const [tsx, tsy, tsz] = tray.size;
  if (cx < tx - tsx - tol || cx > tx + tsx + tol) return false;
  if (cy < ty - tsy - tol || cy > ty + tsy + tol) return false;
  const topZ = tz + tsz;
  if (cz < topZ - tol) return false;
  if (cz > topZ + 0.5) return false;
  return true;
}

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

export const GET: RequestHandler = async () => {
  const { state, staleMs } = getState();
  if (!state) return json({ trays: [], staleMs });
  const cubes = state.bodies.filter(b => b.name.startsWith('cube'));
  const trays = state.trays.map(tray => ({
    name: tray.name,
    pos: tray.pos,
    quat: tray.quat,
    size: tray.size,
    geomType: tray.geomType,
    cubes: cubes.filter(c => cubeInTray(c, tray)).map(summarize)
  }));
  return json({ trays, staleMs });
};
