import { NextRequest, NextResponse } from 'next/server';
import * as crypto from 'crypto';
import { jobs, orders, jobLog, broadcast } from '@/src/store';
import { decryptOrderId } from '@/src/payment';
import { addCreditsForUser } from '@/src/credits';
import { fillAndSubmitForm } from '@/src/formFiller';
import type { SurveyConfig } from '@/src/types';

export async function POST(req: NextRequest) {
  const { encrypted_order_id } = await req.json() as { encrypted_order_id: string; bank: string };

  if (!encrypted_order_id) {
    return NextResponse.json({ error: 'Missing encrypted_order_id' }, { status: 400 });
  }

  let orderId: string;
  try {
    orderId = decryptOrderId(encrypted_order_id);
  } catch {
    return NextResponse.json({ error: 'Failed to decrypt order_id' }, { status: 400 });
  }

  const order = orders.get(orderId);
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  if (order.paid) return NextResponse.json({ ok: true, message: 'Already processed' });

  order.paid = true;

  // ── Credit purchase ─────────────────────────────────────────────────────────
  if (order.kind === 'credit_purchase') {
    try {
      await addCreditsForUser(
        order.userId,
        order.creditsToAdd!,
        'purchase',
        `Package: ${order.packageId} (${order.creditsToAdd} credits)`,
      );
    } catch (err) {
      console.error('Failed to add credits after payment:', err);
      return NextResponse.json({ error: 'Credits add failed' }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  // ── Legacy form-fill (direct per-job payment) ──────────────────────────────
  const jobId = crypto.randomUUID();
  const job: import('@/src/store').Job = {
    id: jobId,
    status: 'running',
    total: order.respondentCount,
    done: 0,
    logs: [],
    results: [],
    clients: new Set<ReadableStreamDefaultController<Uint8Array>>(),
  };
  jobs.set(jobId, job);
  order.jobId = jobId;

  const { url, respondentCount, headless, provider, respondentProfiles, fieldConfigs, mode = 'pct' } = order.jobPayload;
  const surveyConfig: SurveyConfig | null = respondentProfiles.length > 0
    ? { respondentProfiles, questionTargets: [] }
    : null;

  // Fire-and-forget: run the form-filling job in background
  (async () => {
    jobLog(job, `Payment confirmed — job started: ${respondentCount} respondent(s), provider: ${provider}`);
    const personaCounts: Record<string, number> = {};

    for (let i = 0; i < respondentCount; i++) {
      if (provider === 'sealion' && i > 0 && i % 10 === 0) {
        jobLog(job, `\n⏳ SEA-LION rate limit: waiting 60 s before next batch of 10...`);
        await new Promise(r => setTimeout(r, 60_000));
        jobLog(job, `  ▶ Resuming (batch ${Math.floor(i / 10) + 1})...`);
      }

      jobLog(job, `\n[${i + 1}/${respondentCount}] Submitting form...`);

      const result = await fillAndSubmitForm(
        url, i, headless, provider, surveyConfig, fieldConfigs, mode,
        (msg: string) => jobLog(job, msg),
      );

      job.results.push(result);
      job.done = i + 1;

      if (result.persona) personaCounts[result.persona] = (personaCounts[result.persona] ?? 0) + 1;

      if (result.success) {
        const tag = result.persona ? ` (${result.persona})` : '';
        jobLog(job, `  ✓ Respondent ${i + 1}${tag} submitted successfully`);
      } else {
        jobLog(job, `  ✗ Respondent ${i + 1} failed: ${result.error}`);
      }

      broadcast(job, 'progress', { done: job.done, total: job.total, result });

      if (i < respondentCount - 1) await new Promise(r => setTimeout(r, 1500));
    }

    const successCount = job.results.filter(r => r.success).length;
    job.status = 'completed';
    jobLog(job, `\n=== Completed: ${successCount}/${respondentCount} successful ===`);
    broadcast(job, 'complete', {
      total: respondentCount,
      success: successCount,
      failed: respondentCount - successCount,
      personaCounts,
    });
  })().catch(err => {
    job.status = 'failed';
    jobLog(job, `Fatal error: ${err}`);
    broadcast(job, 'error', { message: String(err) });
  });

  return NextResponse.json({ ok: true });
}
