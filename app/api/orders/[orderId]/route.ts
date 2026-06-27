import { NextRequest, NextResponse } from 'next/server';
import { orders } from '@/src/store';
import { checkPaymentByIntent, checkPaymentByOrder } from '@/src/payment';
import { addCreditsForUser, getOrderFromDb, markOrderPaidInDb } from '@/src/credits';

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ orderId: string }> },
) {
  const { orderId } = await context.params;

  // Try in-memory first (fast path), fall back to Supabase (survives restarts)
  const memOrder = orders.get(orderId);
  if (memOrder?.paid) {
    return NextResponse.json({ id: orderId, kind: memOrder.kind, paid: true, jobId: memOrder.jobId, creditsToAdd: memOrder.creditsToAdd ?? null });
  }

  // Determine intentId and userId — prefer in-memory, fall back to DB
  let intentId = memOrder?.intentId ?? null;
  let userId = memOrder?.userId ?? null;
  let creditsToAdd = memOrder?.creditsToAdd ?? null;
  let packageId = memOrder?.packageId ?? null;

  if (!intentId || !userId) {
    const dbOrder = await getOrderFromDb(orderId);
    if (!dbOrder) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    if (dbOrder.paid) {
      return NextResponse.json({ id: orderId, kind: 'credit_purchase', paid: true, jobId: null, creditsToAdd: dbOrder.credits_to_add });
    }
    intentId = dbOrder.intent_id;
    userId = dbOrder.user_id;
    creditsToAdd = dbOrder.credits_to_add;
    packageId = dbOrder.package_id;
  }

  // Check payment status with Baray
  const status = intentId
    ? await checkPaymentByIntent(intentId)
    : await checkPaymentByOrder(orderId);

  if (status === 'success') {
    if (memOrder) memOrder.paid = true;
    await markOrderPaidInDb(orderId);
    try {
      await addCreditsForUser(
        userId!,
        creditsToAdd!,
        'purchase',
        `Package: ${packageId} (${creditsToAdd} credits) — verified via Baray`,
      );
    } catch (err) {
      console.error('Failed to add credits after Baray check:', err);
    }
    return NextResponse.json({ id: orderId, kind: 'credit_purchase', paid: true, jobId: memOrder?.jobId ?? null, creditsToAdd });
  }

  return NextResponse.json({ id: orderId, kind: 'credit_purchase', paid: false, jobId: null, creditsToAdd });
}
