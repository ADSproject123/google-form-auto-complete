import { cookies, headers } from 'next/headers';
import { adminAuth } from '@/src/lib/firebase/admin';
import { SESSION_COOKIE } from '@/src/lib/firebase/constants';

export async function getCurrentUser(): Promise<{ uid: string; email: string | null } | null> {
  // 1. Check session cookie first (standard browser navigation & requests)
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(SESSION_COOKIE)?.value;
    if (sessionCookie) {
      try {
        const decoded = await adminAuth.verifySessionCookie(sessionCookie, false);
        return { uid: decoded.uid, email: decoded.email ?? null };
      } catch {
        // Cookie may be expired or invalid; fall through to authorization header
      }
    }
  } catch {
    // Ignore cookie read issues
  }

  // 2. Check Authorization: Bearer <idToken> header (automatically attached by client authFetch)
  // Firebase client SDK can generate fresh ID tokens indefinitely using the persistent refresh token.
  try {
    const headerStore = await headers();
    const authHeader = headerStore.get('authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const idToken = authHeader.slice(7).trim();
      if (idToken) {
        const decoded = await adminAuth.verifyIdToken(idToken, false);
        return { uid: decoded.uid, email: decoded.email ?? null };
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '';
    if ((err as { digest?: string })?.digest === 'DYNAMIC_SERVER_USAGE' || msg.includes('Dynamic server usage')) {
      throw err;
    }
  }

  return null;
}
