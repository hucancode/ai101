import { json, error } from '@sveltejs/kit';
import { enqueue, hasLeader } from '$lib/server/queue';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async () => {
  if (!hasLeader()) throw error(503, 'no active viewer tab — open the UI to start the simulator');
  const cmd = enqueue('reset');
  return json({ ok: true, id: cmd.id });
};
