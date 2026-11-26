import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAccessToken } from '@/lib/jwt';
import { prisma } from '@/lib/db';
import { apiError } from '@/lib/api-error';
import { finalizeBooking } from '@/lib/booking';
import { getCapturedPaymentForOrder, verifyPaymentSignature } from '@/lib/razorpay';

async function verifyPatient() {
  const cookieStore = await cookies();
  const token = cookieStore.get('accessToken')?.value;
  if (!token) return null;
  const payload = verifyAccessToken(token);
  if (!payload || payload.role !== 'PATIENT') return null;
  return payload;
}

/**
 * Called by the booking screen after Razorpay Checkout reports success.
 * The browser's word is never trusted: the signature is checked when sent,
 * and the order is always looked up with Razorpay to confirm it was paid
 * the right amount before the booking is confirmed.
 */
export async function POST(request: Request) {
  try {
    const patient = await verifyPatient();
    if (!patient) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const appointmentId = typeof body.appointmentId === 'string' ? body.appointmentId : '';
    const appointment = await prisma.appointment.findFirst({
      where: { id: appointmentId, patientId: patient.userId },
      include: { payment: true },
    });
    if (!appointment || !appointment.payment) {
      return NextResponse.json({ error: 'Booking not found.' }, { status: 404 });
    }
    if (appointment.status === 'CONFIRMED') return NextResponse.json({ status: 'confirmed' });

    const orderId = appointment.payment.gatewayRefId;
    if (!orderId) return NextResponse.json({ error: 'Payment was not started for this booking.' }, { status: 400 });

    // If Checkout sent a signature, it must be valid for this order
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;
    if (razorpay_signature) {
      const valid =
        razorpay_order_id === orderId &&
        typeof razorpay_payment_id === 'string' &&
        verifyPaymentSignature(orderId, razorpay_payment_id, String(razorpay_signature));
      if (!valid) return NextResponse.json({ error: 'Payment verification failed.' }, { status: 400 });
    }

    const paid = await getCapturedPaymentForOrder(orderId);
    if (!paid) return NextResponse.json({ status: 'unpaid' });
    const { payment, order } = paid;

    const expectedPaise = Math.round(appointment.payment.amount * 100);
    if (payment.amount !== expectedPaise || payment.order_id !== orderId) {
      console.error('[checkout] amount mismatch', { appointmentId, expectedPaise, paid: payment.amount });
      return NextResponse.json({ error: 'Payment amount does not match this booking.' }, { status: 400 });
    }

    const confirmed = await finalizeBooking(appointment.id, payment.amount / 100, {
      couponId: order.notes?.couponId || null,
      discount: Number(order.notes?.discount) || 0,
    });
    if (!confirmed) {
      const fresh = await prisma.appointment.findUnique({ where: { id: appointment.id }, select: { status: true } });
      if (fresh?.status !== 'CONFIRMED') {
        return NextResponse.json(
          { error: 'Your payment was received, but this slot is no longer available. Our team will refund you shortly.' },
          { status: 409 }
        );
      }
    }
    return NextResponse.json({ status: 'confirmed' });
  } catch (error) {
    return apiError(error, 'Could not confirm your payment. If you were charged, your booking will update shortly.');
  }
}
