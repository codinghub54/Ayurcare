import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAccessToken } from '@/lib/jwt';
import { prisma } from '@/lib/db';
import { apiError } from '@/lib/api-error';
import { cancelPendingBooking } from '@/lib/booking';
import { getCapturedPaymentForOrder } from '@/lib/razorpay';

/** The patient closed Razorpay Checkout before paying: release the slot. */
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

    // Never release a slot that has actually been paid for
    const orderId = appointment.payment?.gatewayRefId;
    if (orderId) {
      const paid = await getCapturedPaymentForOrder(orderId).catch(() => null);
      if (paid) return NextResponse.json({ ok: false, status: 'paid' });
    }

    await cancelPendingBooking(appointment.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error, 'Could not cancel checkout.');
  }
}
