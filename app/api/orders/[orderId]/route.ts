import { NextRequest, NextResponse } from 'next/server';
import { orders } from '@/src/store';

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ orderId: string }> },
) {
  const { orderId } = await context.params;
  const order = orders.get(orderId);
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  return NextResponse.json({
    id: order.id,
    paid: order.paid,
    price: order.price,
    jobId: order.jobId,
  });
}
