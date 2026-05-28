import { json, error } from '@sveltejs/kit';
import { enqueue, hasLeader } from '$lib/server/queue';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
  if (!hasLeader()) throw error(503, 'no active viewer tab — open the UI to start the simulator');
  const body = await request.json().catch(() => null);
  if (body?.aperture !== undefined && typeof body.aperture === 'number') {
    const cmd = enqueue('gripper', { aperture: body.aperture });
    return json({ ok: true, id: cmd.id });
  }
  if (!Array.isArray(body?.actuator) || body.actuator.some((v: unknown) => typeof v !== 'number')) {
    throw error(400, 'expected {actuator:[numbers]} or {aperture:number}');
  }
  const cmd = enqueue('actuator', { values: body.actuator });
  return json({ ok: true, id: cmd.id });
};
