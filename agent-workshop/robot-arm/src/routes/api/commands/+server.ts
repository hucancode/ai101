import { json } from '@sveltejs/kit';
import { drain } from '$lib/server/queue';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
  return json({ commands: drain() });
};
