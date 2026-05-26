import { json, error } from '@sveltejs/kit';
import { enqueue, hasLeader } from '$lib/server/queue';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
  if (!hasLeader()) throw error(503, 'no active viewer tab — open the UI to start the simulator');
  const body = await request.json().catch(() => null);
  if (!body || typeof body.speed !== 'number' || body.speed <= 0) {
    throw error(400, 'expected {speed:number > 0}');
  }
  const cmd = enqueue('speed', { value: body.speed });
  return json({ ok: true, id: cmd.id });
};
