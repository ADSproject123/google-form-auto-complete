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

  const body = await req.json() as { packageId?: string; credits?: number };

  // Resolve credits and price — either from a preset package or a custom amount
  let credits: number;
  let priceCents: number;
  let label: string;
  let packageId: string;

  if (body.packageId) {
    const pkg = CREDIT_PACKAGES.find(p => p.id === body.packageId);
    if (!pkg) return NextResponse.json({ error: 'Invalid package' }, { status: 400 });
    credits = pkg.credits;
    priceCents = pkg.priceCents;
    label = pkg.label;
    packageId = pkg.id;
  } else if (body.credits && body.credits >= 1) {
    credits = Math.floor(body.credits);
    // $0.01 per credit, minimum $0.03 (Baray minimum charge)
    priceCents = Math.max(Math.round(credits), 3);
    label = `${credits} Credits`;
    packageId = 'custom';
  } else {
    return NextResponse.json({ error: 'Provide packageId or credits' }, { status: 400 });
  }

  const orderId = crypto.randomUUID();
  const baseUrl = process.env.APP_BASE_URL ?? 'http://localhost:3000';
  const successUrl = `${baseUrl}/app?tab=credits&orderId=${orderId}`;

  try {
    const { checkoutUrl, intentId } = await createCreditPurchaseIntent(
      orderId,
      label,
      credits,
      priceCents,
      successUrl,
    );

    const orderData = {
      id: orderId,
      kind: 'credit_purchase' as const,
      userId: user.id,
      paid: false,
      price: priceCents / 100,
      creditsToAdd: credits,
      packageId,
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
      credits_to_add: credits,
      package_id: packageId,
    });

    return NextResponse.json({ checkoutUrl, orderId });
  } catch (err) {
    return NextResponse.json({ error: `Payment gateway error: ${String(err)}` }, { status: 502 });
  }
}
