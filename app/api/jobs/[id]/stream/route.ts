import { NextRequest } from 'next/server';
import { jobs } from '@/src/store';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const job = jobs.get(id);
  if (!job) return new Response('Job not found', { status: 404 });

  const encoder = new TextEncoder();
  let ctrl: ReadableStreamDefaultController<Uint8Array>;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      ctrl = controller;

      // Replay buffered logs for catch-up clients
      for (const log of job.logs) {
        controller.enqueue(encoder.encode(`event: log\ndata: ${JSON.stringify({ message: log })}\n\n`));
      }

      if (job.status === 'completed') {
        controller.enqueue(encoder.encode(`event: complete\ndata: {}\n\n`));
        controller.close();
        return;
      }

      job.clients.add(controller);
    },
  });

  // Clean up when client disconnects
  request.signal.addEventListener('abort', () => {
    if (ctrl) {
      job.clients.delete(ctrl);
      try { ctrl.close(); } catch { /* already closed */ }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
