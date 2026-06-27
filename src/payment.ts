import * as crypto from 'crypto';
import * as dotenv from 'dotenv';
dotenv.config();

const SK = process.env.BARAY_SK!;
const IV = process.env.BARAY_IV!;
const API_KEY = process.env.BARAY_API_KEY!;
const ORG_ID = process.env.BARAY_ORG_ID!;
const PAY_URL = process.env.BARAY_PAY_URL ?? 'https://api.baray.io/pay';
const CHECK_URL = process.env.BARAY_CHECK_URL ?? 'https://api.baray.io/payments/check/order';
const CHECKOUT_BASE = process.env.BARAY_CHECKOUT_BASE_URL ?? 'https://pay.baray.io';
const CURRENCY = process.env.BARAY_CURRENCY ?? 'USD';

export const PRICE_PER_10_RESPONDENTS = 0.10; // $0.10 per 10 respondents

export function calcPrice(respondentCount: number): number {
  return Math.ceil(respondentCount / 10) * PRICE_PER_10_RESPONDENTS;
}

/** Verify payment by Baray intent ID — no org_id needed, most reliable. */
export async function checkPaymentByIntent(intentId: string): Promise<'success' | 'pending' | 'unknown'> {
  const CHECK_INTENT_URL = 'https://api.baray.io/payments/check/intent';
  try {
    const res = await fetch(CHECK_INTENT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
      body: JSON.stringify({ intent_id: intentId }),
    });
    const text = await res.text();
    if (!res.ok) {
      console.error(`[Baray check/intent] HTTP ${res.status}:`, text);
      return 'unknown';
    }
    const data = JSON.parse(text) as { status?: string };
    console.log(`[Baray check/intent] intent=${intentId} response=${text}`);
    if (data.status?.toLowerCase() === 'success') return 'success';
    return 'pending';
  } catch (err) {
    console.error('[Baray check/intent] error:', err);
    return 'unknown';
  }
}

/** Verify payment by order ID (fallback — requires BARAY_ORG_ID). */
export async function checkPaymentByOrder(orderId: string): Promise<'success' | 'pending' | 'unknown'> {
  try {
    const res = await fetch(CHECK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
      body: JSON.stringify({ org_id: ORG_ID, order_id: orderId }),
    });
    const text = await res.text();
    if (!res.ok) {
      console.error(`[Baray check/order] HTTP ${res.status}:`, text);
      return 'unknown';
    }
    const data = JSON.parse(text) as { status?: string };
    console.log(`[Baray check/order] order=${orderId} response=${text}`);
    if (data.status?.toLowerCase() === 'success') return 'success';
    return 'pending';
  } catch (err) {
    console.error('[Baray check/order] error:', err);
    return 'unknown';
  }
}

export async function createCreditPurchaseIntent(
  orderId: string,
  packageLabel: string,
  credits: number,
  priceCents: number,
  successUrl: string,
): Promise<CreateIntentResult> {
  const amount = priceCents / 100;

  const payload = {
    amount: amount.toFixed(2),
    currency: CURRENCY,
    order_id: orderId,
    tracking: { type: 'credit_purchase', credits },
    order_details: {
      items: [{ name: `${packageLabel} — ${credits} credits`, price: amount }],
    },
    custom_success_url: successUrl,
  };

  const res = await fetch(PAY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
    body: JSON.stringify({ data: encryptPayload(payload) }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Baray error ${res.status}: ${text}`);
  }

  const intent = await res.json() as { _id: string };
  return {
    intentId: intent._id,
    checkoutUrl: `${CHECKOUT_BASE}/${intent._id}`,
    amount,
  };
}

function encryptPayload(payload: object): string {
  const key = Buffer.from(SK, 'base64');
  const iv = Buffer.from(IV, 'base64');
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(JSON.stringify(payload), 'utf8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return encrypted.toString('base64');
}

export function decryptOrderId(encryptedOrderId: string): string {
  const key = Buffer.from(SK, 'base64');
  const iv = Buffer.from(IV, 'base64');
  const data = Buffer.from(encryptedOrderId, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(data);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString('utf8');
}

export interface CreateIntentResult {
  intentId: string;
  checkoutUrl: string;
  amount: number;
}

export async function createPaymentIntent(
  orderId: string,
  respondentCount: number,
  successUrl: string,
  cancelUrl?: string,
): Promise<CreateIntentResult> {
  const amount = calcPrice(respondentCount);

  const payload: Record<string, unknown> = {
    amount: amount.toFixed(2),
    currency: CURRENCY,
    order_id: orderId,
    tracking: { respondent_count: respondentCount },
    order_details: {
      items: [{ name: `Survey Auto-Fill — ${respondentCount} respondent(s)`, price: amount }],
    },
    custom_success_url: successUrl,
  };
  if (cancelUrl) payload.custom_cancel_url = cancelUrl;

  const res = await fetch(PAY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
    body: JSON.stringify({ data: encryptPayload(payload) }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Baray error ${res.status}: ${text}`);
  }

  const intent = await res.json() as { _id: string };
  return {
    intentId: intent._id,
    checkoutUrl: `${CHECKOUT_BASE}/${intent._id}`,
    amount,
  };
}
