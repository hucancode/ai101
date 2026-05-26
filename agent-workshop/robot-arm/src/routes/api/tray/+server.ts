import { json } from '@sveltejs/kit';
import { getState } from '$lib/server/queue';
import type { BodyInfo, Tray } from '$lib/robot/types';
import type { RequestHandler } from './$types';

// Cube fully inside tray: cube AABB-XY contained in tray AABB-XY (no overflow),
// cube sits on or above tray top, and not floating away.
function cubeFullyInTray(cube: BodyInfo, tray: Tray): boolean {
  const g = cube.geoms[0];
  if (!g) return false;
  const [cx, cy, cz] = cube.pos;
  const [csx, csy, csz] = g.size;
  const [tx, ty, tz] = tray.pos;
  const [tsx, tsy, tsz] = tray.size;
  if (cx - csx < tx - tsx) return false;
  if (cx + csx > tx + tsx) return false;
  if (cy - csy < ty - tsy) return false;
  if (cy + csy > ty + tsy) return false;
  const topZ = tz + tsz;
  if (cz - csz < topZ - 0.005) return false;
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
  const trays = state.trays.map(tray => {
    const [sx, sy] = tray.size;
    return {
      name: tray.name,
      pos: tray.pos,
      quat: tray.quat,
      size: tray.size,
      area: 4 * sx * sy,
      geomType: tray.geomType,
      cubes: cubes.filter(c => cubeFullyInTray(c, tray)).map(summarize)
    };
  });
  return json({ trays, staleMs });
};
