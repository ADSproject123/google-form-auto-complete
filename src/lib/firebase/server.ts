import { cookies } from 'next/headers';
import { adminAuth } from '@/src/lib/firebase/admin';
import { SESSION_COOKIE } from '@/src/lib/firebase/constants';

export async function getCurrentUser(): Promise<{ uid: string; email: string | null } | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE)?.value;
  if (!sessionCookie) return null;

  try {
    const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);
    return { uid: decoded.uid, email: decoded.email ?? null };
  } catch {
    return null;
  }
}
