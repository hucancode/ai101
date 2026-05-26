import { json, error } from '@sveltejs/kit';
import { enqueue, hasLeader } from '$lib/server/queue';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
  if (!hasLeader()) throw error(503, 'no active viewer tab — open the UI to start the simulator');
  const body = await request.json().catch(() => null);
  if (!body || typeof body.x !== 'number' || typeof body.y !== 'number' || typeof body.z !== 'number') {
    throw error(400, 'expected {x:number,y:number,z:number,duration?:number}');
  }
  const cmd = enqueue('move_to', {
    x: body.x, y: body.y, z: body.z,
    duration: typeof body.duration === 'number' ? body.duration : 1500
  });
  return json({ ok: true, id: cmd.id });
};
