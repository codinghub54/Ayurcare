import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAccessToken } from '@/lib/jwt';
import { prisma } from '@/lib/db';
import { getStripeClient } from '@/lib/stripe';
import { apiError } from '@/lib/api-error';
import { cancelPendingBooking } from '@/lib/booking';

/** The patient closed checkout before paying: release the slot and cancel the PaymentIntent. */
export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('accessToken')?.value;
    const patient = token ? verifyAccessToken(token) : null;
    if (!patient || patient.role !== 'PATIENT') return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const appointment = await prisma.appointment.findFirst({
      where: { id: String(body.appointmentId || ''), patientId: patient.userId, status: 'PENDING' },
      include: { payment: true },
    });
    if (!appointment) return NextResponse.json({ ok: true });

    const piId = appointment.payment?.gatewayRefId;
    if (piId) {
      const stripe = getStripeClient();
      const pi = await stripe.paymentIntents.retrieve(piId);
      // Never cancel something that has already been paid or is being processed
      if (pi.status === 'succeeded' || pi.status === 'processing') {
        return NextResponse.json({ ok: false, status: pi.status });
      }
      if (pi.status !== 'canceled') await stripe.paymentIntents.cancel(piId).catch(() => {});
    }
    await cancelPendingBooking(appointment.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error, 'Could not cancel checkout.');
  }
}
