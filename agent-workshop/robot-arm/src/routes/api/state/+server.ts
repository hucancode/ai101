import { json } from '@sveltejs/kit';
import { setState } from '$lib/server/queue';
import type { RobotState } from '$lib/robot/types';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
  const body = (await request.json()) as RobotState;
  setState(body);
  return json({ ok: true });
};
