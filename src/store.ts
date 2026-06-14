import type { FormSubmissionResult, JobRequest } from './types';

export interface Job {
  id: string;
  status: 'running' | 'completed' | 'failed';
  total: number;
  done: number;
  logs: string[];
  results: FormSubmissionResult[];
  clients: Set<ReadableStreamDefaultController<Uint8Array>>;
}

export interface Order {
  id: string;
  paid: boolean;
  price: number;
  respondentCount: number;
  jobPayload: JobRequest;
  jobId: string | null;
  createdAt: number;
}

// In Next.js dev mode each route module gets its own module instance on lazy
// compile. Pinning to globalThis ensures all routes share one Map instance
// across HMR reloads (in production this is a no-op — modules are cached once).
declare global {
  // eslint-disable-next-line no-var
  var __jobs: Map<string, Job> | undefined;
  // eslint-disable-next-line no-var
  var __orders: Map<string, Order> | undefined;
}

export const jobs: Map<string, Job> =
  globalThis.__jobs ?? (globalThis.__jobs = new Map());
export const orders: Map<string, Order> =
  globalThis.__orders ?? (globalThis.__orders = new Map());

const encoder = new TextEncoder();

export function broadcast(job: Job, event: string, data: unknown) {
  const payload = encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  job.clients.forEach(ctrl => {
    try {
      ctrl.enqueue(payload);
      if (event === 'complete' || event === 'error') ctrl.close();
    } catch {
      // client already disconnected
    }
  });
  if (event === 'complete' || event === 'error') job.clients.clear();
}

export function jobLog(job: Job, msg: string) {
  job.logs.push(msg);
  broadcast(job, 'log', { message: msg });
}
