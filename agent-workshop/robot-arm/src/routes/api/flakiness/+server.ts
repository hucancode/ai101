import { json, error } from '@sveltejs/kit';
import { enqueue, hasLeader } from '$lib/server/queue';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
  if (!hasLeader()) throw error(503, 'no active viewer tab — open the UI to start the simulator');
  const body = await request.json().catch(() => null);
  if (!body || typeof body.flakiness !== 'number' || body.flakiness < 0 || body.flakiness > 1) {
    throw error(400, 'expected {flakiness:number in [0,1]}');
  }
  const cmd = enqueue('flakiness', { value: body.flakiness });
  return json({ ok: true, id: cmd.id });
};
