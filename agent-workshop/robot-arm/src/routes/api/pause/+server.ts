import { json, error } from '@sveltejs/kit';
import { enqueue, hasLeader } from '$lib/server/queue';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
  if (!hasLeader()) throw error(503, 'no active viewer tab — open the UI to start the simulator');
  const body = await request.json().catch(() => ({}));
  const paused = typeof body?.paused === 'boolean' ? body.paused : true;
  const cmd = enqueue(paused ? 'pause' : 'resume');
  return json({ ok: true, id: cmd.id });
};
