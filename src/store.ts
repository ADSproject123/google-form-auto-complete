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

export const jobs = new Map<string, Job>();
export const orders = new Map<string, Order>();

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
