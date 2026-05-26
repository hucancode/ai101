import { json, error } from '@sveltejs/kit';
import { enqueue, hasLeader } from '$lib/server/queue';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
  if (!hasLeader()) throw error(503, 'no active viewer tab — open the UI to start the simulator');
  const body = await request.json().catch(() => null);
  if (body?.gripper !== undefined && typeof body.gripper === 'number') {
    const cmd = enqueue('gripper', { value: body.gripper });
    return json({ ok: true, id: cmd.id });
  }
  if (!Array.isArray(body?.ctrl) || body.ctrl.some((v: unknown) => typeof v !== 'number')) {
    throw error(400, 'expected {ctrl:[numbers]} or {gripper:number}');
  }
  const cmd = enqueue('ctrl', { values: body.ctrl });
  return json({ ok: true, id: cmd.id });
};
