/**
 * Minimal Razorpay REST client (no SDK needed).
 *
 * Env vars (server only, never exposed to the browser):
 *   RAZORPAY_KEY_ID          rzp_test_... / rzp_live_...  (the key id is public and is sent to Checkout)
 *   RAZORPAY_KEY_SECRET      secret used for API auth and payment signature checks
 *   RAZORPAY_WEBHOOK_SECRET  optional, the secret you set on the Razorpay webhook
 */
import crypto from 'crypto';

const API = 'https://api.razorpay.com/v1';

export class RazorpayNotConfiguredError extends Error {
  constructor() {
    super('Razorpay is not configured.');
    this.name = 'RazorpayNotConfiguredError';
  }
}

export function getRazorpayKeyId(): string {
  const id = process.env.RAZORPAY_KEY_ID;
  if (!id || !process.env.RAZORPAY_KEY_SECRET) throw new RazorpayNotConfiguredError();
  return id;
}

export function isRazorpayConfigured() {
  return !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

async function rzp<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const keyId = getRazorpayKeyId();
  const secret = process.env.RAZORPAY_KEY_SECRET!;
  const res = await fetch(`${API}${path}`, {
    method: init?.method || 'GET',
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${secret}`).toString('base64')}`,
      'Content-Type': 'application/json',
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
    cache: 'no-store',
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const description = json?.error?.description || `HTTP ${res.status}`;
    throw new Error(`Razorpay ${path}: ${description}`);
  }
  return json as T;
}

export interface RazorpayOrder {
  id: string;
  amount: number; // paise
  amount_paid: number;
  currency: string;
  receipt: string | null;
  status: 'created' | 'attempted' | 'paid';
  notes: Record<string, string>;
}

export interface RazorpayPayment {
  id: string;
  order_id: string;
  amount: number; // paise
  currency: string;
  status: 'created' | 'authorized' | 'captured' | 'refunded' | 'failed';
  notes: Record<string, string>;
}

export function createOrder(params: { amountPaise: number; receipt: string; notes: Record<string, string> }) {
  return rzp<RazorpayOrder>('/orders', {
    method: 'POST',
    body: {
      amount: params.amountPaise,
      currency: 'INR',
      receipt: params.receipt.slice(0, 40),
      notes: params.notes,
      payment_capture: 1, // capture automatically once authorised
    },
  });
}

export function fetchOrder(orderId: string) {
  return rzp<RazorpayOrder>(`/orders/${encodeURIComponent(orderId)}`);
}

export async function fetchOrderPayments(orderId: string) {
  const res = await rzp<{ items: RazorpayPayment[] }>(`/orders/${encodeURIComponent(orderId)}/payments`);
  return res.items || [];
}

export function capturePayment(paymentId: string, amountPaise: number) {
  return rzp<RazorpayPayment>(`/payments/${encodeURIComponent(paymentId)}/capture`, {
    method: 'POST',
    body: { amount: amountPaise, currency: 'INR' },
  });
}

export function refundPayment(paymentId: string, amountPaise: number, notes?: Record<string, string>) {
  return rzp<{ id: string; status: string }>(`/payments/${encodeURIComponent(paymentId)}/refund`, {
    method: 'POST',
    body: { amount: amountPaise, notes },
  });
}

/**
 * Find the successful payment for an order, capturing it if it was only
 * authorised. Returns null when the order has not been paid.
 */
export async function getCapturedPaymentForOrder(
  orderId: string
): Promise<{ payment: RazorpayPayment; order: RazorpayOrder } | null> {
  const order = await fetchOrder(orderId);
  const payments = await fetchOrderPayments(orderId);
  const captured = payments.find((p) => p.status === 'captured' || p.status === 'refunded');
  if (captured) return { payment: captured, order };
  const authorised = payments.find((p) => p.status === 'authorized');
  if (authorised && authorised.amount === order.amount) {
    return { payment: await capturePayment(authorised.id, authorised.amount), order };
  }
  return null;
}

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

/** Checkout handler signature: HMAC_SHA256(order_id + "|" + payment_id, key_secret). */
export function verifyPaymentSignature(orderId: string, paymentId: string, signature: string) {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret || !signature) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
  return safeEqual(expected, signature);
}

/** Webhook signature: HMAC_SHA256(raw body, webhook secret). */
export function verifyWebhookSignature(rawBody: string, signature: string) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return safeEqual(expected, signature);
}
