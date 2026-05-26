import { json, error } from '@sveltejs/kit';
import { enqueue, hasLeader } from '$lib/server/queue';
import type { RequestHandler } from './$types';

interface Pt { x: number; y: number; z: number }

export const POST: RequestHandler = async ({ request }) => {
  if (!hasLeader()) throw error(503, 'no active viewer tab — open the UI to start the simulator');
  const body = await request.json().catch(() => null);
  if (!body || !Array.isArray(body.targets) || body.targets.length === 0) {
    throw error(400, 'expected {targets:[{x,y,z}, ...]}');
  }
  for (const p of body.targets as Pt[]) {
    if (typeof p?.x !== 'number' || typeof p?.y !== 'number' || typeof p?.z !== 'number') {
      throw error(400, 'each target needs x,y,z numbers');
    }
  }
  const cmd = enqueue('pickup', { targets: body.targets });
  return json({ ok: true, id: cmd.id });
};
