import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

/**
 * Normalise the private key from an env var. Hosting dashboards (Vercel etc.)
 * often store it with literal "\n" sequences and/or wrapping quotes.
 */
function normalizePrivateKey(raw: string): string {
  let key = raw.trim();
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1);
  }
  return key.replace(/\\n/g, '\n');
}

/** Lazily initialise the Admin SDK so a config problem surfaces as a clear error inside a request, not a module-load crash. */
function getAdminApp(): App {
  const existing = getApps();
  if (existing.length) return existing[0];

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY;

  const missing = [
    !projectId && 'FIREBASE_PROJECT_ID',
    !clientEmail && 'FIREBASE_CLIENT_EMAIL',
    !privateKeyRaw && 'FIREBASE_PRIVATE_KEY',
  ].filter(Boolean);
  if (missing.length) {
    throw new Error(`Firebase Admin is not configured. Missing env var(s): ${missing.join(', ')}`);
  }

  try {
    return initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey: normalizePrivateKey(privateKeyRaw!),
      }),
    });
  } catch (err) {
    throw new Error(
      `Firebase Admin credentials are invalid (check FIREBASE_PRIVATE_KEY formatting): ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

function lazy<T extends object>(factory: () => T): T {
  let instance: T | undefined;
  return new Proxy({} as T, {
    get(_target, prop) {
      instance ??= factory();
      const value = (instance as Record<string | symbol, unknown>)[prop];
      return typeof value === 'function' ? value.bind(instance) : value;
    },
  });
}

export const adminAuth: Auth = lazy(() => getAuth(getAdminApp()));
export const adminDb: Firestore = lazy(() => getFirestore(getAdminApp()));
