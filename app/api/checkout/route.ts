import { NextRequest, NextResponse } from 'next/server';
import * as crypto from 'crypto';
import { orders } from '@/src/store';
import { createPaymentIntent, calcPrice } from '@/src/payment';
import type { JobRequest } from '@/src/types';

export async function POST(req: NextRequest) {
  const body = await req.json() as JobRequest;
  const { url, respondentCount, headless, provider, respondentProfiles, fieldConfigs, mode = 'pct' } = body;

  if (!url || !respondentCount || !provider) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const providerKey = provider === 'claude' ? process.env.ANTHROPIC_API_KEY : process.env.SEALION_API_KEY;
  if (!providerKey) {
    const keyName = provider === 'claude' ? 'ANTHROPIC_API_KEY' : 'SEALION_API_KEY';
    return NextResponse.json({ error: `${keyName} is not set in the server's .env file` }, { status: 400 });
  }

  const orderId = crypto.randomUUID();
  const price = calcPrice(respondentCount);
  const baseUrl = process.env.APP_BASE_URL ?? 'http://localhost:3000';
  const successUrl = `${baseUrl}/payment-success?orderId=${orderId}`;

  try {
    const { checkoutUrl, amount } = await createPaymentIntent(orderId, respondentCount, successUrl);

    orders.set(orderId, {
      id: orderId,
      kind: 'form_fill',
      userId: '',
      paid: false,
      price,
      respondentCount,
      jobPayload: { url, respondentCount, headless, provider, respondentProfiles, fieldConfigs, mode },
      jobId: null,
      createdAt: Date.now(),
    });

    return NextResponse.json({ checkoutUrl, orderId, price: amount });
  } catch (err) {
    return NextResponse.json({ error: `Payment gateway error: ${String(err)}` }, { status: 502 });
  }
}
