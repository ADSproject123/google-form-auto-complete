'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, type AuthError } from 'firebase/auth';
import { auth } from '@/src/lib/firebase/client';

function LoginForm() {
  const [tab, setTab] = useState<'login' | 'signup'>('login');
  const [forgot, setForgot] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'error' | 'success' | 'info' } | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  async function establishSession(next: string) {
    const idToken = await auth.currentUser!.getIdToken();
    await fetch('/api/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });
    router.push(next);
    router.refresh();
  }

  function friendlyAuthError(err: unknown): string {
    const code = (err as AuthError)?.code ?? '';
    switch (code) {
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
      case 'auth/user-not-found':
        return 'Invalid email or password.';
      case 'auth/email-already-in-use':
        return 'An account with this email already exists.';
      case 'auth/weak-password':
        return 'Password must be at least 6 characters.';
      case 'auth/invalid-email':
        return 'Please enter a valid email address.';
      case 'auth/too-many-requests':
        return 'Too many attempts. Please try again later.';
      default:
        return err instanceof Error ? err.message : 'Something went wrong.';
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      if (forgot) {
        try {
          await sendPasswordResetEmail(auth, email, {
            url: `${window.location.origin}/login`,
          });
        } catch (err) {
          const code = (err as AuthError)?.code;
          // Don't reveal whether an account exists
          if (code !== 'auth/user-not-found') throw err;
        }
        setMessage({ text: 'If an account exists for that email, a password reset link has been sent. Check your inbox (and spam).', type: 'success' });
        setLoading(false);
        return;
      }
      if (tab === 'login') {
        await signInWithEmailAndPassword(auth, email, password);
        await establishSession(searchParams.get('next') ?? '/app');
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
        await establishSession('/app');
      }
    } catch (err) {
      setMessage({ text: friendlyAuthError(err), type: 'error' });
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        {/* Logo + title */}
        <div className="text-center mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.png" alt="Dev Kilo Zin" className="w-14 h-14 rounded-xl object-cover mx-auto mb-3" />
          <h1 className="text-2xl font-bold text-gray-900">Dev Kilo Zin</h1>
          <p className="text-sm text-gray-500 mt-1">AI-Powered Google Form Auto-Filler</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">

          {/* Tabs */}
          <div className="flex border-b border-gray-100">
            <button
              onClick={() => { setTab('login'); setForgot(false); setMessage(null); }}
              className={`flex-1 py-3.5 text-sm font-semibold transition-colors ${tab === 'login' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
            >
              Sign in
            </button>
            <button
              onClick={() => { setTab('signup'); setForgot(false); setMessage(null); }}
              className={`flex-1 py-3.5 text-sm font-semibold transition-colors ${tab === 'signup' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
            >
              Create account
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            {!forgot && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-medium text-gray-600">Password</label>
                {tab === 'login' && (
                  <button
                    type="button"
                    onClick={() => { setForgot(true); setMessage(null); }}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              {tab === 'signup' && (
                <p className="mt-1 text-xs text-gray-400">Minimum 6 characters</p>
              )}
            </div>
            )}
            {forgot && (
              <p className="text-xs text-gray-500">Enter your email and we&apos;ll send you a link to reset your password.</p>
            )}

            {message && (
              <div className={`rounded-lg px-3.5 py-2.5 text-xs font-medium ${
                message.type === 'error' ? 'bg-red-50 text-red-600 border border-red-200'
                : message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200'
                : 'bg-blue-50 text-blue-700 border border-blue-200'
              }`}>
                {message.text}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
            >
              {loading && (
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              )}
              {loading ? 'Please wait…' : forgot ? 'Send reset link' : tab === 'login' ? 'Sign in' : 'Create account'}
            </button>
            {forgot && (
              <button
                type="button"
                onClick={() => { setForgot(false); setMessage(null); }}
                className="w-full text-xs text-gray-500 hover:text-gray-700"
              >
                Back to sign in
              </button>
            )}
          </form>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          Pricing: $0.10 per 10 respondents
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
