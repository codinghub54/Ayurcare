import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { prisma } from '@/lib/db';
import { getStripeClient } from '@/lib/stripe';
import { finalizeBooking, cancelPendingBooking } from '@/lib/booking';

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret || !process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'Stripe webhook is not configured.' }, { status: 503 });
  }

  const stripe = getStripeClient();

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    return NextResponse.json({ error: 'Webhook signature verification failed' }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        await handlePaymentSuccess(paymentIntent);
        break;
      }

      case 'payment_intent.payment_failed':
      case 'payment_intent.canceled': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        await handlePaymentFailure(paymentIntent);
        break;
      }

      default:
        // Ignore unhandled event types
        break;
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error('Webhook handler error:', error);
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }
}

/** Find the booking a PaymentIntent belongs to (metadata first, then stored reference). */
async function appointmentIdFor(paymentIntent: Stripe.PaymentIntent): Promise<string | null> {
  if (paymentIntent.metadata?.appointmentId) return paymentIntent.metadata.appointmentId;
  const payment = await prisma.payment.findFirst({
    where: { gatewayRefId: paymentIntent.id },
    select: { appointmentId: true },
  });
  return payment?.appointmentId ?? null;
}

async function handlePaymentSuccess(paymentIntent: Stripe.PaymentIntent) {
  const appointmentId = await appointmentIdFor(paymentIntent);
  if (!appointmentId) {
    console.error(`No booking found for PaymentIntent ${paymentIntent.id}`);
    return;
  }
  // Idempotent: a no-op if the booking screen already confirmed it
  await finalizeBooking(appointmentId, paymentIntent.amount_received / 100, {
    couponId: paymentIntent.metadata?.couponId || null,
    discount: Number(paymentIntent.metadata?.discount) || 0,
  });
}

async function handlePaymentFailure(paymentIntent: Stripe.PaymentIntent) {
  const appointmentId = await appointmentIdFor(paymentIntent);
  if (appointmentId) await cancelPendingBooking(appointmentId);
}
