import { NextRequest, NextResponse } from 'next/server';
import * as crypto from 'crypto';
import { createClient } from '@/src/lib/supabase/server';
import { CREDIT_COSTS, spendCredits } from '@/src/credits';
import { jobs, jobLog, broadcast } from '@/src/store';
import { fillAndSubmitForm } from '@/src/formFiller';
import type { JobRequest, SurveyConfig } from '@/src/types';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as JobRequest;
  const { url, respondentCount, headless, provider, respondentProfiles, fieldConfigs, mode = 'pct' } = body;

  if (!url || !respondentCount || !provider) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const providerKey = provider === 'claude' ? process.env.ANTHROPIC_API_KEY : process.env.SEALION_API_KEY;
  if (!providerKey) {
    const keyName = provider === 'claude' ? 'ANTHROPIC_API_KEY' : 'SEALION_API_KEY';
    return NextResponse.json({ error: `${keyName} is not configured on the server` }, { status: 400 });
  }

  const cost = respondentCount * CREDIT_COSTS.form_fill;
  const spent = await spendCredits(cost, 'form_fill', `${respondentCount} respondent(s) — ${url.slice(0, 60)}`);

  if (!spent.ok) {
    return NextResponse.json(
      { error: 'Insufficient credits', balance: spent.balance, required: cost },
      { status: 402 },
    );
  }

  const jobId = crypto.randomUUID();
  const job: import('@/src/store').Job = {
    id: jobId,
    status: 'running',
    total: respondentCount,
    done: 0,
    logs: [],
    results: [],
    clients: new Set(),
  };
  jobs.set(jobId, job);

  const surveyConfig: SurveyConfig | null = respondentProfiles.length > 0
    ? { respondentProfiles, questionTargets: [] }
    : null;

  (async () => {
    jobLog(job, `Job started: ${respondentCount} respondent(s), provider: ${provider}`);
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

  return NextResponse.json({ jobId, creditsSpent: cost, balance: spent.balance });
}
