import { NextRequest, NextResponse } from 'next/server';
import { orders } from '@/src/store';
import { checkPaymentByIntent, checkPaymentByOrder } from '@/src/payment';
import { addCreditsForUser } from '@/src/credits';

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ orderId: string }> },
) {
  const { orderId } = await context.params;
  const order = orders.get(orderId);
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

  // If not yet paid, ask Baray directly — use intent_id (no org_id needed),
  // fall back to order_id check if intentId wasn't stored.
  if (!order.paid && order.kind === 'credit_purchase') {
    const status = order.intentId
      ? await checkPaymentByIntent(order.intentId)
      : await checkPaymentByOrder(orderId);

    if (status === 'success') {
      order.paid = true;
      try {
        await addCreditsForUser(
          order.userId,
          order.creditsToAdd!,
          'purchase',
          `Package: ${order.packageId} (${order.creditsToAdd} credits) — verified via Baray`,
        );
      } catch (err) {
        console.error('Failed to add credits after Baray check:', err);
      }
    }
  }

  return NextResponse.json({
    id: order.id,
    kind: order.kind,
    paid: order.paid,
    price: order.price,
    jobId: order.jobId,
    creditsToAdd: order.creditsToAdd ?? null,
  });
}
