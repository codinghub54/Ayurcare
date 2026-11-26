import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { finalizeBooking } from '@/lib/booking';
import { verifyWebhookSignature, type RazorpayOrder, type RazorpayPayment } from '@/lib/razorpay';

/**
 * Razorpay webhook (optional backup to the booking screen's confirm call).
 * Configure in Razorpay Dashboard > Settings > Webhooks:
 *   URL:    https://<your-site>/api/webhooks/razorpay
 *   Events: payment.captured, order.paid
 *   Secret: the same value as RAZORPAY_WEBHOOK_SECRET
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get('x-razorpay-signature') || '';

  if (!process.env.RAZORPAY_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Razorpay webhook is not configured.' }, { status: 503 });
  }
  if (!verifyWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    const event = JSON.parse(rawBody) as {
      event: string;
      payload?: { payment?: { entity: RazorpayPayment }; order?: { entity: RazorpayOrder } };
    };

    if (event.event === 'payment.captured' || event.event === 'order.paid') {
      const payment = event.payload?.payment?.entity;
      const order = event.payload?.order?.entity;
      const orderId = payment?.order_id || order?.id;
      if (!payment || !orderId) return NextResponse.json({ received: true });

      const record = await prisma.payment.findFirst({
        where: { gatewayRefId: orderId },
        select: { appointmentId: true, amount: true },
      });
      if (!record) {
        console.error(`[razorpay] no booking for order ${orderId}`);
        return NextResponse.json({ received: true });
      }
      if (payment.amount !== Math.round(record.amount * 100)) {
        console.error(`[razorpay] amount mismatch for order ${orderId}`);
        return NextResponse.json({ received: true });
      }

      const notes = order?.notes || payment.notes || {};
      await finalizeBooking(record.appointmentId, payment.amount / 100, {
        couponId: notes.couponId || null,
        discount: Number(notes.discount) || 0,
      });
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('[razorpay] webhook handler error', error);
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }
}
