import { createClient } from '@/src/lib/supabase/server';
import { createAdminClient } from '@/src/lib/supabase/admin';

export const CREDIT_COSTS = {
  form_fill:   1,  // per respondent
  pdf_convert: 10,
  youtube_dl:  5,
} as const;

export type CreditKind = keyof typeof CREDIT_COSTS | 'purchase' | 'refund';

export const CREDIT_PACKAGES = [
  { id: 'starter',  credits: 100,  priceCents: 100,  label: '100 Credits',  usd: '$1.00', popular: false },
  { id: 'standard', credits: 500,  priceCents: 400,  label: '500 Credits',  usd: '$4.00', popular: true  },
  { id: 'pro',      credits: 1200, priceCents: 800,  label: '1,200 Credits', usd: '$8.00', popular: false },
] as const;

export type PackageId = typeof CREDIT_PACKAGES[number]['id'];

export async function getBalance(userId: string): Promise<number> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('user_credits')
    .select('balance')
    .eq('user_id', userId)
    .single();
  return data?.balance ?? 0;
}

export async function getTransactions(userId: string, limit = 20) {
  const admin = createAdminClient();
  const { data } = await admin
    .from('credit_transactions')
    .select('id, delta, kind, note, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  return data ?? [];
}

/** Atomically deduct credits from the authenticated user (uses Supabase RPC). */
export async function spendCredits(
  amount: number,
  kind: string,
  note: string,
): Promise<{ ok: boolean; balance: number; error?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('spend_credits', {
    p_amount: amount,
    p_kind:   kind,
    p_note:   note,
  });
  if (error) return { ok: false, balance: 0, error: error.message };
  const result = data as { ok: boolean; balance?: number; error?: string };
  return { ok: result.ok, balance: result.balance ?? 0, error: result.error };
}

/** Add credits to a user — called server-side (webhook) with service role. */
export async function addCreditsForUser(
  userId: string,
  amount: number,
  kind: string,
  note: string,
): Promise<number> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc('add_credits_for_user', {
    p_user_id: userId,
    p_amount:  amount,
    p_kind:    kind,
    p_note:    note,
  });
  if (error) throw new Error(error.message);
  return data as number;
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
  const admin = createAdminClient();
  await admin.from('pending_credit_orders').upsert({
    id: order.id,
    intent_id: order.intent_id,
    user_id: order.user_id,
    credits_to_add: order.credits_to_add,
    package_id: order.package_id,
    paid: false,
  });
}

export async function getOrderFromDb(orderId: string): Promise<DbOrder | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('pending_credit_orders')
    .select('*')
    .eq('id', orderId)
    .single();
  return data ?? null;
}

export async function markOrderPaidInDb(orderId: string): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from('pending_credit_orders')
    .update({ paid: true })
    .eq('id', orderId);
}
