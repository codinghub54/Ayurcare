import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAccessToken } from '@/lib/jwt';
import { prisma } from '@/lib/db';
import { getStripeClient } from '@/lib/stripe';
import { apiError } from '@/lib/api-error';
import { finalizeBooking, cancelPendingBooking } from '@/lib/booking';

async function verifyPatient() {
  const cookieStore = await cookies();
  const token = cookieStore.get('accessToken')?.value;
  if (!token) return null;
  const payload = verifyAccessToken(token);
  if (!payload || payload.role !== 'PATIENT') return null;
  return payload;
}

/**
 * Called by the booking screen after Stripe reports the card step finished.
 * Verifies the PaymentIntent directly with Stripe (never trusts the browser),
 * so bookings confirm even if the webhook is delayed or not configured.
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
    if (!appointment.payment.gatewayRefId) {
      return NextResponse.json({ error: 'Payment was not started for this booking.' }, { status: 400 });
    }

    const pi = await getStripeClient().paymentIntents.retrieve(appointment.payment.gatewayRefId);
    if (pi.metadata?.appointmentId !== appointment.id || pi.metadata?.patientId !== patient.userId) {
      return NextResponse.json({ error: 'Payment does not match this booking.' }, { status: 400 });
    }

    if (pi.status === 'succeeded') {
      await finalizeBooking(appointment.id, pi.amount_received / 100, {
        couponId: pi.metadata.couponId || null,
        discount: Number(pi.metadata.discount) || 0,
      });
      return NextResponse.json({ status: 'confirmed' });
    }
    if (pi.status === 'processing') return NextResponse.json({ status: 'processing' });
    if (pi.status === 'canceled') {
      await cancelPendingBooking(appointment.id);
      return NextResponse.json({ status: 'cancelled' });
    }
    return NextResponse.json({ status: 'unpaid' });
  } catch (error) {
    return apiError(error, 'Could not confirm your payment. If you were charged, your booking will update shortly.');
  }
}
