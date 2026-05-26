import { json, error } from '@sveltejs/kit';
import { enqueue, hasLeader } from '$lib/server/queue';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
  if (!hasLeader()) throw error(503, 'no active viewer tab — open the UI to start the simulator');
  const body = await request.json().catch(() => null);
  const value = body?.value ?? body?.openness ?? body?.gripper;
  if (typeof value !== 'number') {
    throw error(400, 'expected {value:number} in [0..255] (0=closed, 255=open)');
  }
  const clamped = Math.max(0, Math.min(255, value));
  const cmd = enqueue('gripper', { value: clamped });
  return json({ ok: true, id: cmd.id, value: clamped });
};
