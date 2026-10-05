import type { CollectionReference } from 'firebase-admin/firestore';
import { adminDb } from '@/src/lib/firebase/admin';
import { getCurrentUser } from '@/src/lib/firebase/server';

export const CREDIT_COSTS = {
  form_fill:      1,  // per respondent
  pdf_convert:    10,
  youtube_dl:     5,
  video_compress: 15,
  image_compress: 3,
  image_convert:  3,
} as const;

export type CreditKind = keyof typeof CREDIT_COSTS | 'purchase' | 'refund';

export const CREDIT_PACKAGES = [
  { id: 'starter',  credits: 100,  priceCents: 100,  label: '100 Credits',  usd: '$1.00', popular: false },
  { id: 'standard', credits: 500,  priceCents: 400,  label: '500 Credits',  usd: '$4.00', popular: true  },
  { id: 'pro',      credits: 1200, priceCents: 800,  label: '1,200 Credits', usd: '$8.00', popular: false },
] as const;

export type PackageId = typeof CREDIT_PACKAGES[number]['id'];

// Resolved on first use so a Firebase Admin config problem doesn't crash module loading
function lazyCollection(name: string): CollectionReference {
  return new Proxy({} as CollectionReference, {
    get(_target, prop) {
      const col = adminDb.collection(name) as unknown as Record<string | symbol, unknown>;
      const value = col[prop];
      return typeof value === 'function' ? value.bind(col) : value;
    },
  });
}

const userCredits = lazyCollection('user_credits');
const creditTransactions = lazyCollection('credit_transactions');
const pendingCreditOrders = lazyCollection('pending_credit_orders');

export async function getBalance(userId: string): Promise<number> {
  const doc = await userCredits.doc(userId).get();
  return (doc.data()?.balance as number | undefined) ?? 0;
}

export async function getTransactions(userId: string, limit = 20) {
  const snap = await creditTransactions
    .where('userId', '==', userId)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();
  return snap.docs.map(d => {
    const data = d.data();
    return {
      id: d.id,
      delta: data.delta as number,
      kind: data.kind as string,
      note: (data.note as string | null) ?? null,
      created_at: data.createdAt as string,
    };
  });
}

/** Atomically deduct credits from the currently authenticated user (Firestore transaction). */
export async function spendCredits(
  amount: number,
  kind: string,
  note: string,
): Promise<{ ok: boolean; balance: number; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, balance: 0, error: 'not_authenticated' };

  const ref = userCredits.doc(user.uid);

  try {
    const balance = await adminDb.runTransaction(async (tx) => {
      const doc = await tx.get(ref);
      const current = (doc.data()?.balance as number | undefined) ?? 0;
      if (current < amount) throw new Error('insufficient_credits');
      const next = current - amount;
      tx.set(ref, { balance: next, updatedAt: new Date().toISOString() }, { merge: true });
      tx.set(creditTransactions.doc(), {
        userId: user.uid,
        delta: -amount,
        kind,
        note,
        createdAt: new Date().toISOString(),
      });
      return next;
    });
    return { ok: true, balance };
  } catch (err) {
    if (err instanceof Error && err.message === 'insufficient_credits') {
      const current = await getBalance(user.uid);
      return { ok: false, balance: current, error: 'insufficient_credits' };
    }
    throw err;
  }
}

/** Add credits to a user — called server-side (webhook) after confirmed payment. */
export async function addCreditsForUser(
  userId: string,
  amount: number,
  kind: string,
  note: string,
): Promise<number> {
  const ref = userCredits.doc(userId);
  return adminDb.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    const current = (doc.data()?.balance as number | undefined) ?? 0;
    const next = current + amount;
    tx.set(ref, { balance: next, updatedAt: new Date().toISOString() }, { merge: true });
    tx.set(creditTransactions.doc(), {
      userId,
      delta: amount,
      kind,
      note,
      createdAt: new Date().toISOString(),
    });
    return next;
  });
}

/** Refund credits to a user (e.g. on server-side conversion failure). */
export async function refundCredits(userId: string, amount: number, note: string): Promise<void> {
  await addCreditsForUser(userId, amount, 'refund', note);
}

// ── Persistent order storage (survives server restarts / serverless cold starts) ──

export interface DbOrder {
  id: string;
  intent_id: string;
  user_id: string;
  credits_to_add: number;
  package_id: string;
  paid: boolean;
}

export async function saveOrderToDb(order: Omit<DbOrder, 'paid'>): Promise<void> {
  await pendingCreditOrders.doc(order.id).set({
    intentId: order.intent_id,
    userId: order.user_id,
    creditsToAdd: order.credits_to_add,
    packageId: order.package_id,
    paid: false,
  });
}

export async function getOrderFromDb(orderId: string): Promise<DbOrder | null> {
  const doc = await pendingCreditOrders.doc(orderId).get();
  if (!doc.exists) return null;
  const data = doc.data()!;
  return {
    id: orderId,
    intent_id: data.intentId,
    user_id: data.userId,
    credits_to_add: data.creditsToAdd,
    package_id: data.packageId,
    paid: data.paid,
  };
}

export async function markOrderPaidInDb(orderId: string): Promise<void> {
  await pendingCreditOrders.doc(orderId).update({ paid: true });
}
