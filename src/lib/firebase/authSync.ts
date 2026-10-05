'use client';

import type { User } from 'firebase/auth';
import { auth } from './client';

let isSyncing = false;
let lastSyncTime = 0;

/**
 * Sends the current Firebase user's ID token to /api/auth/session
 * to establish or extend the server-side __session cookie.
 */
export async function syncSessionCookie(user?: User | null): Promise<boolean> {
  const currentUser = user ?? auth.currentUser;
  if (!currentUser) return false;

  const now = Date.now();
  // Prevent duplicate concurrent syncs or multiple syncs within 10 seconds
  if (isSyncing || (now - lastSyncTime < 10000)) return true;
  isSyncing = true;

  try {
    const idToken = await currentUser.getIdToken();
    const res = await fetch('/api/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });
    if (res.ok) {
      lastSyncTime = Date.now();
    }
    return res.ok;
  } catch (err) {
    console.warn('[authSync] Could not sync session cookie:', err);
    return false;
  } finally {
    isSyncing = false;
  }
}

/**
 * Enhanced fetch that automatically includes the user's fresh Firebase ID token
 * in the Authorization: Bearer <token> header.
 * This guarantees API calls succeed even if the server session cookie has expired.
 */
export async function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  if (auth.currentUser) {
    try {
      const idToken = await auth.currentUser.getIdToken();
      if (idToken) {
        headers.set('Authorization', `Bearer ${idToken}`);
      }
    } catch {
      // Continue without token; cookie will be used
    }
  }
  return fetch(input, { ...init, headers });
}
