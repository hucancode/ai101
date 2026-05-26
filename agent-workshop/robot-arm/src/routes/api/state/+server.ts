import { json } from '@sveltejs/kit';
import { getState, queueDepth, setState } from '$lib/server/queue';
import type { RobotState } from '$lib/robot/types';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
  const { state, staleMs } = getState();
  return json({ state, staleMs, pending: queueDepth() });
};

export const POST: RequestHandler = async ({ request }) => {
  const body = (await request.json()) as RobotState;
  setState(body);
  return json({ ok: true });
};
