import { NextRequest, NextResponse } from 'next/server';
import { jobs } from '@/src/store';

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const job = jobs.get(id);
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  return NextResponse.json({
    id: job.id,
    status: job.status,
    total: job.total,
    done: job.done,
    results: job.results,
  });
}
