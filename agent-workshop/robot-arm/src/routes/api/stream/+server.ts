import { subscribe } from '$lib/server/queue';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
  const sessionId = url.searchParams.get('sid');
  if (!sessionId || sessionId.length < 4) {
    return new Response('missing sid', { status: 400 });
  }

  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      const write = (chunk: string) => {
        try { controller.enqueue(enc.encode(chunk)); } catch (_) { /* closed */ }
      };

      write(': connected\n\n');

      unsubscribe = subscribe({
        id: sessionId,
        send(event, data) {
          write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        }
      });

      heartbeat = setInterval(() => write(': hb\n\n'), 15000);
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
      if (unsubscribe) unsubscribe();
    }
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      'connection': 'keep-alive',
      'x-accel-buffering': 'no'
    }
  });
};
