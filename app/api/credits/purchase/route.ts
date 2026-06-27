import { NextRequest, NextResponse } from 'next/server';
import * as crypto from 'crypto';
import { createClient } from '@/src/lib/supabase/server';
import { CREDIT_PACKAGES, saveOrderToDb } from '@/src/credits';
import { orders } from '@/src/store';
import { createCreditPurchaseIntent } from '@/src/payment';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { packageId } = await req.json() as { packageId: string };
  const pkg = CREDIT_PACKAGES.find(p => p.id === packageId);
  if (!pkg) return NextResponse.json({ error: 'Invalid package' }, { status: 400 });

  const orderId = crypto.randomUUID();
  const baseUrl = process.env.APP_BASE_URL ?? 'http://localhost:3000';
  const successUrl = `${baseUrl}/app?tab=credits&orderId=${orderId}`;

  try {
    const { checkoutUrl, intentId } = await createCreditPurchaseIntent(
      orderId,
      pkg.label,
      pkg.credits,
      pkg.priceCents,
      successUrl,
    );

    const orderData = {
      id: orderId,
      kind: 'credit_purchase' as const,
      userId: user.id,
      paid: false,
      price: pkg.priceCents / 100,
      creditsToAdd: pkg.credits,
      packageId: pkg.id,
      intentId,
      respondentCount: 0,
      jobPayload: {} as never,
      jobId: null,
      createdAt: Date.now(),
    };
    orders.set(orderId, orderData);

    // Persist to Supabase so it survives server restarts / serverless cold starts
    await saveOrderToDb({
      id: orderId,
      intent_id: intentId,
      user_id: user.id,
      credits_to_add: pkg.credits,
      package_id: pkg.id,
    });

    return NextResponse.json({ checkoutUrl, orderId });
  } catch (err) {
    return NextResponse.json({ error: `Payment gateway error: ${String(err)}` }, { status: 502 });
  }
}
