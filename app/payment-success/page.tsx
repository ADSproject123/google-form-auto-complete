'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/src/lib/supabase/client';

interface Order {
  id: string;
  paid: boolean;
  price: number;
  jobId: string | null;
}

interface LogLine {
  text: string;
  cls: string;
}

interface Summary {
  success: number;
  failed: number;
  personaCounts: Record<string, number>;
}

export default function PaymentSuccessPage() {
  const router = useRouter();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  const [phase, setPhase] = useState<'waiting' | 'running' | 'error'>('waiting');
  const [errorMsg, setErrorMsg] = useState('');
  const [order, setOrder] = useState<Order | null>(null);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [summary, setSummary] = useState<Summary | null>(null);
  const [devConfirming, setDevConfirming] = useState(false);
  const [showDevBtn, setShowDevBtn] = useState(false);
  const [currentOrderId, setCurrentOrderId] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDev = process.env.NODE_ENV !== 'production';

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const orderId = params.get('orderId');
    if (!orderId) { setPhase('error'); setErrorMsg('No order ID found in URL.'); return; }
    setCurrentOrderId(orderId);
    pollOrder(orderId);
    return () => { if (pollRef.current) clearTimeout(pollRef.current); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function pollOrder(orderId: string) {
    try {
      const res = await fetch(`/api/orders/${orderId}`);
      if (!res.ok) { setPhase('error'); setErrorMsg('Order not found. Please contact support.'); return; }
      const data: Order = await res.json();
      if (data.paid && data.jobId) {
        setOrder(data);
        setPhase('running');
        startStream(data.jobId);
      } else {
        // Show dev button after 4 s of waiting (webhook likely unreachable locally)
        if (isDev) setTimeout(() => setShowDevBtn(true), 4000);
        pollRef.current = setTimeout(() => pollOrder(orderId), 2000);
      }
    } catch {
      pollRef.current = setTimeout(() => pollOrder(orderId), 3000);
    }
  }

  async function devConfirmPayment() {
    if (!currentOrderId) return;
    setDevConfirming(true);
    try {
      const res = await fetch('/api/dev/confirm-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: currentOrderId }),
      });
      const data = await res.json() as { ok?: boolean; jobId?: string; error?: string };
      if (!res.ok) { alert(`Dev confirm failed: ${data.error}`); return; }
      if (data.jobId) {
        setOrder(prev => prev ? { ...prev, paid: true, jobId: data.jobId! } : null);
        setPhase('running');
        startStream(data.jobId);
        setShowDevBtn(false);
        if (pollRef.current) clearTimeout(pollRef.current);
      }
    } catch (err: unknown) {
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDevConfirming(false);
    }
  }

  function startStream(jobId: string) {
    fetch(`/api/jobs/${jobId}`)
      .then(r => r.json())
      .then((job: { done: number; total: number }) => setProgress({ done: job.done, total: job.total }))
      .catch(() => {});

    const es = new EventSource(`/api/jobs/${jobId}/stream`);

    es.addEventListener('log', e => {
      const { message } = JSON.parse(e.data) as { message: string };
      const cls = message.includes('✓') ? 'text-green-400'
        : (message.includes('✗') || message.toLowerCase().includes('error') || message.includes('failed')) ? 'text-red-400'
        : message.match(/^\s*\[/) ? 'text-blue-400'
        : 'text-gray-100';
      setLogs(prev => [...prev, { text: message, cls }]);
      setTimeout(() => { logRef.current?.scrollTo(0, logRef.current.scrollHeight); }, 0);
    });

    es.addEventListener('progress', e => {
      const { done } = JSON.parse(e.data) as { done: number };
      setProgress(prev => ({ ...prev, done }));
    });

    es.addEventListener('complete', e => {
      const s = JSON.parse(e.data) as Summary;
      setSummary(s);
      setProgress(prev => ({ ...prev, done: prev.total }));
      es.close();
    });

    es.addEventListener('error', () => { es.close(); });
  }

  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="bg-gray-50 min-h-screen">
      <header className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.png" alt="Dev Kilo Zin" className="w-9 h-9 rounded-lg object-cover" />
          <h1 className="text-lg font-semibold text-gray-900">Dev Kilo Zin</h1>
          <span className="text-xs text-gray-400">AI-Powered</span>
          <button
            onClick={signOut}
            className="ml-auto text-xs text-gray-500 hover:text-gray-800 border border-gray-200 hover:border-gray-300 px-3 py-1.5 rounded-lg transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10 space-y-6">

        {/* Status card */}
        <section className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          {phase === 'waiting' && (
            <>
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-blue-100 flex items-center justify-center animate-pulse">
                <svg className="w-8 h-8 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-gray-800 mb-1">Confirming payment…</h2>
              <p className="text-sm text-gray-500">Waiting for bank confirmation. This usually takes a few seconds.</p>

              {/* Dev-only helper: webhook unreachable on localhost */}
              {isDev && showDevBtn && (
                <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-xl text-left">
                  <p className="text-xs font-semibold text-amber-700 mb-1">Development mode</p>
                  <p className="text-xs text-amber-600 mb-3">
                    Baray webhook can&apos;t reach localhost. Click below to simulate the payment confirmation and start the job.
                  </p>
                  <button
                    onClick={devConfirmPayment}
                    disabled={devConfirming}
                    className="bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors"
                  >
                    {devConfirming ? 'Starting…' : 'Simulate payment confirmation'}
                  </button>
                </div>
              )}
            </>
          )}

          {phase === 'running' && (
            <>
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center">
                <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-gray-800 mb-1">Payment confirmed!</h2>
              <p className="text-sm text-gray-500 mb-2">Your job is now running. Track progress below.</p>
              {order && <p className="text-xs text-gray-400">Amount charged: ${order.price.toFixed(2)} USD</p>}
            </>
          )}

          {phase === 'error' && (
            <>
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
                <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-gray-800 mb-1">Order not found</h2>
              <p className="text-sm text-gray-500 mb-4">{errorMsg}</p>
              <a href="/" className="inline-block bg-blue-600 text-white text-sm font-medium px-5 py-2.5 rounded-lg hover:bg-blue-700">
                Back to home
              </a>
            </>
          )}
        </section>

        {/* Job progress */}
        {phase === 'running' && (
          <section className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Progress</h2>
            <div className="mb-4">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>{progress.done} / {progress.total}</span>
                <span>{pct}%</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all duration-500 ${summary ? 'bg-green-500' : 'bg-blue-500'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>

            <div
              ref={logRef}
              className="font-mono text-[12.5px] leading-relaxed bg-gray-900 rounded-lg p-4 h-80 overflow-y-auto whitespace-pre-wrap"
            >
              {logs.map((l, i) => (
                <div key={i} className={l.cls}>{l.text}</div>
              ))}
            </div>

            {summary && (
              <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Summary</h3>
                <div className="flex gap-6 text-sm text-gray-600">
                  <div><span className="font-semibold text-green-600">{summary.success}</span> successful</div>
                  <div><span className="font-semibold text-red-500">{summary.failed}</span> failed</div>
                  <div className="text-gray-400">of {progress.total}</div>
                </div>
                {Object.keys(summary.personaCounts ?? {}).length > 0 && (
                  <div className="mt-2 text-sm text-gray-600">
                    Persona breakdown:
                    <span className="flex flex-wrap gap-2 mt-1">
                      {Object.entries(summary.personaCounts).map(([n, c]) => (
                        <span key={n} className="bg-blue-50 text-blue-700 text-xs px-2.5 py-1 rounded-full">
                          {n}: {c} ({Math.round((c as number) / progress.total * 100)}%)
                        </span>
                      ))}
                    </span>
                  </div>
                )}
                <a href="/" className="inline-block mt-3 text-sm text-blue-600 hover:underline font-medium">
                  Start another job
                </a>
              </div>
            )}
          </section>
        )}

      </main>
    </div>
  );
}
