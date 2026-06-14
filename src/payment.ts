import * as crypto from 'crypto';
import * as dotenv from 'dotenv';
dotenv.config();

const SK = process.env.BARAY_SK!;
const IV = process.env.BARAY_IV!;
const API_KEY = process.env.BARAY_API_KEY!;
const PAY_URL = process.env.BARAY_PAY_URL ?? 'https://api.baray.io/pay';
const CHECKOUT_BASE = process.env.BARAY_CHECKOUT_BASE_URL ?? 'https://pay.baray.io';
const CURRENCY = process.env.BARAY_CURRENCY ?? 'USD';

export const PRICE_PER_10_RESPONDENTS = 0.10; // $0.10 per 10 respondents

export function calcPrice(respondentCount: number): number {
  return Math.ceil(respondentCount / 10) * PRICE_PER_10_RESPONDENTS;
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
): Promise<CreateIntentResult> {
  const amount = calcPrice(respondentCount);

  const payload = {
    amount: amount.toFixed(2),
    currency: CURRENCY,
    order_id: orderId,
    tracking: { respondent_count: respondentCount },
    order_details: {
      items: [{ name: `Survey Auto-Fill — ${respondentCount} respondent(s)`, price: amount }],
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
