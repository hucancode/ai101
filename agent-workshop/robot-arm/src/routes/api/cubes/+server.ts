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

export const GET: RequestHandler = async () => {
  const { state, staleMs } = getState();
  if (!state) return json({ cubes: [], staleMs });
  const cubes = state.bodies.filter(b => b.name.startsWith('cube')).map(summarize);
  return json({ cubes, staleMs });
};
