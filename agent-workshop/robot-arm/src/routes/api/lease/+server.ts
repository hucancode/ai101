import { json, error } from '@sveltejs/kit';
import { claimLease, releaseLease, getLeader } from '$lib/server/queue';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
  return json({ leaderId: getLeader() });
};

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json().catch(() => null);
  const sessionId = body?.sessionId;
  if (typeof sessionId !== 'string' || sessionId.length < 4) {
    throw error(400, 'expected {sessionId:string}');
  }
  if (body?.release === true) {
    releaseLease(sessionId);
    return json({ released: true });
  }
  const res = claimLease(sessionId);
  return json(res);
};
