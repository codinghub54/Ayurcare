import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAccessToken } from '@/lib/jwt';
import { prisma } from '@/lib/db';
import { createOrder, getRazorpayKeyId, RazorpayNotConfiguredError } from '@/lib/razorpay';
import { apiError, PublicError } from '@/lib/api-error';
import { CONSULT_TYPES, type ConsultType, assertSlotAvailable, quoteConsultation, finalizeBooking } from '@/lib/booking';
import { getConsultFees, CONSULT_TYPE_LABELS } from '@/lib/doctor-fees';
import { getDoctorSlots } from '@/lib/ayurbot-agent';

const COMMISSION_RATE = 0.15;

async function verifyPatient() {
  const cookieStore = await cookies();
  const token = cookieStore.get('accessToken')?.value;
  if (!token) return null;
  const payload = verifyAccessToken(token);
  if (!payload || payload.role !== 'PATIENT') return null;
  return payload;
}

/**
 * Start checkout for a consultation: reserve the slot, price it on the server
 * and create the Razorpay order the browser will pay through Razorpay Checkout.
 */
export async function POST(request: Request) {
  let createdAppointmentId: string | null = null;
  try {
    const patient = await verifyPatient();
    if (!patient) return NextResponse.json({ error: 'Please sign in to book a consultation.' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const doctorId = typeof body.doctorId === 'string' ? body.doctorId : '';
    const type = body.type as ConsultType;
    if (!doctorId) throw new PublicError('Please choose a physician.');
    if (!CONSULT_TYPES.includes(type)) throw new PublicError('Please choose a consultation type.');

    const doctor = await prisma.doctorProfile.findFirst({
      where: { userId: doctorId, isApproved: true, user: { status: 'ACTIVE' } },
      select: { feePerConsult: true, availability: true },
    });
    if (!doctor) throw new PublicError('This physician cannot accept consultations at the moment.');
    const typeFee = getConsultFees(doctor)[type];
    if (typeFee === null) {
      throw new PublicError(`This physician does not offer ${CONSULT_TYPE_LABELS[type].toLowerCase()} consultations.`);
    }

    let familyMemberId: string | null = null;
    if (typeof body.familyMemberId === 'string' && body.familyMemberId) {
      const member = await prisma.familyMember.findFirst({ where: { id: body.familyMemberId, patientProfileId: patient.userId } });
      if (!member) throw new PublicError('Family member not found.');
      familyMemberId = member.id;
    }

    const scheduledAt = await assertSlotAvailable(doctorId, patient.userId, body.scheduledAt);

    // The time must be one of the doctor's published, still-open slots (IST)
    const istDate = scheduledAt.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const istTime = scheduledAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
    const open = await getDoctorSlots(doctorId, istDate);
    if ('error' in open || !open.openSlots.includes(istTime)) {
      throw new PublicError('That time is outside the doctor\'s consulting hours or already taken. Please pick another slot.');
    }
    const quote = await quoteConsultation({
      patientId: patient.userId,
      doctorId,
      type,
      fee: typeFee,
      couponCode: body.couponCode,
    });

    // Older accounts may not have a patient profile row yet
    await prisma.patientProfile.upsert({
      where: { userId: patient.userId },
      update: {},
      create: { userId: patient.userId, lifestyleData: '{}' },
    });

    const appointment = await prisma.appointment.create({
      data: {
        patientId: patient.userId,
        doctorId,
        familyMemberId,
        scheduledAt,
        type,
        status: 'PENDING',
        feePaid: quote.total,
        payment: {
          create: {
            amount: quote.total,
            commission: Math.round(quote.total * COMMISSION_RATE * 100) / 100,
            status: 'PENDING',
          },
        },
      },
    });
    createdAppointmentId = appointment.id;

    await prisma.auditLog.create({
      data: {
        actorUserId: patient.userId,
        action: 'PATIENT_CHECKOUT_STARTED',
        targetUserId: doctorId,
        metadata: JSON.stringify({ appointmentId: appointment.id, total: quote.total, couponCode: quote.couponCode }),
      },
    });

    // Fully covered by a coupon: nothing to charge
    if (quote.total <= 0) {
      await finalizeBooking(appointment.id, 0, { couponId: quote.couponId, discount: quote.discount });
      return NextResponse.json({ appointmentId: appointment.id, free: true, ...quote });
    }

    const keyId = getRazorpayKeyId(); // throws a clear error if Razorpay is not configured
    const amountPaise = Math.round(quote.total * 100);
    const order = await createOrder({
      amountPaise,
      receipt: appointment.id,
      notes: {
        appointmentId: appointment.id,
        patientId: patient.userId,
        doctorId,
        scheduledAt: scheduledAt.toISOString(),
        type,
        couponId: quote.couponId || '',
        discount: String(quote.discount),
      },
    });

    await prisma.payment.update({ where: { appointmentId: appointment.id }, data: { gatewayRefId: order.id } });

    const user = await prisma.user.findUnique({ where: { id: patient.userId }, select: { name: true, email: true, phone: true } });

    return NextResponse.json({
      appointmentId: appointment.id,
      free: false,
      ...quote,
      razorpay: {
        keyId,
        orderId: order.id,
        amount: amountPaise,
        currency: 'INR',
        prefill: { name: user?.name || '', email: user?.email || '', contact: user?.phone || '' },
      },
    });
  } catch (error) {
    // Never leave a reservation behind if payment setup failed
    if (createdAppointmentId) {
      await prisma.appointment.delete({ where: { id: createdAppointmentId } }).catch(() => {});
    }
    if (error instanceof RazorpayNotConfiguredError) {
      return NextResponse.json({ error: 'Online payments are not set up yet. Please try again later.' }, { status: 503 });
    }
    return apiError(error, 'Could not start checkout. Please try again.');
  }
}
