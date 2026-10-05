import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/src/lib/firebase/admin';
import { SESSION_COOKIE } from '@/src/lib/firebase/constants';

const SESSION_EXPIRES_IN = 14 * 24 * 60 * 60 * 1000; // 2 weeks, matches Firebase's max

export async function POST(req: NextRequest) {
  const { idToken } = await req.json() as { idToken?: string };
  if (!idToken) return NextResponse.json({ error: 'Missing idToken' }, { status: 400 });

  try {
    await adminAuth.verifyIdToken(idToken);
    const sessionCookie = await adminAuth.createSessionCookie(idToken, { expiresIn: SESSION_EXPIRES_IN });

    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, sessionCookie, {
      maxAge: SESSION_EXPIRES_IN / 1000,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });
    return res;
  } catch (err) {
    console.error('[auth/session] failed:', err);
    const msg = err instanceof Error ? err.message : '';
    if (msg.startsWith('Firebase Admin')) {
      return NextResponse.json({ error: msg }, { status: 500 });
    }
    return NextResponse.json({ error: 'Invalid ID token' }, { status: 401 });
  }
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
