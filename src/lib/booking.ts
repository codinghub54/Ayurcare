/**
 * Consultation booking: pricing, slot checks and payment confirmation.
 *
 * Flow
 *  1. checkout (POST /api/patient/checkout): validates the slot, prices it on the
 *     server (doctor fee minus a valid coupon), creates a PENDING appointment +
 *     payment, and a Stripe PaymentIntent tied to that appointment.
 *  2. The browser collects the card with Stripe's Payment Element.
 *  3. confirm (POST /api/patient/checkout/confirm) or the Stripe webhook verifies
 *     the PaymentIntent with Stripe and calls finalizeBooking(). Whichever runs
 *     first confirms the appointment; the other is a no-op.
 */
import { prisma } from '@/lib/db';
import { PublicError } from '@/lib/api-error';
import { sendAppointmentConfirmationEmail } from '@/lib/email';

export const CONSULT_TYPES = ['VIDEO', 'AUDIO', 'CHAT'] as const;
export type ConsultType = (typeof CONSULT_TYPES)[number];

/** Unpaid reservations hold a slot for this long before others can book it. */
export const PENDING_HOLD_MINUTES = 30;
const COMMISSION_RATE = 0.15;
const MAX_DAYS_AHEAD = 4;

export interface Quote {
  fee: number;
  discount: number;
  total: number;
  couponId: string | null;
  couponCode: string | null;
}

/** Server-authoritative price for a consultation, applying a coupon only if it is valid. */
export async function quoteConsultation(params: {
  patientId: string;
  doctorId: string;
  type: ConsultType;
  fee: number;
  couponCode?: string | null;
}): Promise<Quote> {
  const { patientId, doctorId, type, fee } = params;
  const code = params.couponCode ? String(params.couponCode).trim().toUpperCase() : '';
  if (!code) return { fee, discount: 0, total: fee, couponId: null, couponCode: null };

  const coupon = await prisma.coupon.findUnique({ where: { code } });
  const now = new Date();
  const valid =
    coupon &&
    coupon.isActive &&
    now >= coupon.startDate &&
    now <= coupon.expiryDate &&
    coupon.usedCount < coupon.maxUsesTotal &&
    (!coupon.applicableDoctorId || coupon.applicableDoctorId === doctorId) &&
    (!coupon.consultationType || coupon.consultationType === type) &&
    fee >= coupon.minOrderValue;
  if (!valid) throw new PublicError('This coupon cannot be used for this consultation.');

  const used = await prisma.couponUsage.count({ where: { couponId: coupon.id, userId: patientId } });
  if (used >= coupon.perUserLimit) throw new PublicError('You have already used this coupon.');

  let discount =
    coupon.discountType === 'FLAT'
      ? Math.min(coupon.discountValue, fee)
      : Math.min(fee * (coupon.discountValue / 100), coupon.maxDiscountAmount ?? Infinity);
  discount = Math.round(discount * 100) / 100;
  return { fee, discount, total: Math.max(0, Math.round((fee - discount) * 100) / 100), couponId: coupon.id, couponCode: code };
}

/** Validate the requested time and that the doctor is free. Returns the scheduled Date. */
export async function assertSlotAvailable(doctorId: string, patientId: string, scheduledAtRaw: unknown): Promise<Date> {
  const scheduledAt = new Date(String(scheduledAtRaw));
  if (Number.isNaN(scheduledAt.getTime())) throw new PublicError('Please choose a valid date and time.');

  const now = Date.now();
  if (scheduledAt.getTime() < now - 5 * 60 * 1000) throw new PublicError('That time has already passed. Please choose another slot.');
  if (scheduledAt.getTime() > now + MAX_DAYS_AHEAD * 24 * 60 * 60 * 1000) {
    throw new PublicError(`Consultations can be booked up to ${MAX_DAYS_AHEAD - 1} days ahead.`);
  }

  // Release this patient's own unpaid hold on the same slot so they can retry checkout
  await releaseStaleHolds({ doctorId, scheduledAt, patientId });

  const holdCutoff = new Date(now - PENDING_HOLD_MINUTES * 60 * 1000);
  const clash = await prisma.appointment.findFirst({
    where: {
      doctorId,
      scheduledAt,
      OR: [{ status: 'CONFIRMED' }, { status: 'PENDING', createdAt: { gte: holdCutoff } }],
    },
    select: { id: true },
  });
  if (clash) throw new PublicError('This slot was just taken. Please choose another time.', 409);
  return scheduledAt;
}

/** Cancel unpaid reservations: the patient's own for this slot, plus anyone's that have expired. */
async function releaseStaleHolds({ doctorId, scheduledAt, patientId }: { doctorId: string; scheduledAt: Date; patientId: string }) {
  const holdCutoff = new Date(Date.now() - PENDING_HOLD_MINUTES * 60 * 1000);
  const stale = await prisma.appointment.findMany({
    where: {
      doctorId,
      scheduledAt,
      status: 'PENDING',
      OR: [{ patientId }, { createdAt: { lt: holdCutoff } }],
    },
    select: { id: true },
  });
  if (!stale.length) return;
  const ids = stale.map((s) => s.id);
  await prisma.$transaction([
    prisma.appointment.updateMany({ where: { id: { in: ids }, status: 'PENDING' }, data: { status: 'CANCELLED' } }),
    prisma.payment.updateMany({ where: { appointmentId: { in: ids }, status: 'PENDING' }, data: { status: 'FAILED' } }),
  ]);
}

/**
 * Mark a paid booking as confirmed. Idempotent: only the first caller that moves
 * the payment from PENDING to SUCCESS does the work and sends emails.
 */
export async function finalizeBooking(
  appointmentId: string,
  paidAmount: number,
  coupon?: { couponId: string | null; discount: number }
): Promise<boolean> {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { payment: true },
  });
  if (!appointment || !appointment.payment) return false;
  const couponId = coupon?.couponId || null;
  const discount = coupon?.discount || 0;

  const transitioned = await prisma.$transaction(async (tx) => {
    const updated = await tx.payment.updateMany({
      where: { appointmentId, status: 'PENDING' },
      data: { status: 'SUCCESS', amount: paidAmount, commission: Math.round(paidAmount * COMMISSION_RATE * 100) / 100 },
    });
    if (updated.count === 0) return false;

    await tx.appointment.update({ where: { id: appointmentId }, data: { status: 'CONFIRMED', feePaid: paidAmount } });

    if (couponId) {
      await tx.couponUsage.create({ data: { couponId, userId: appointment.patientId, appointmentId, discountAmount: discount } });
      await tx.coupon.update({ where: { id: couponId }, data: { usedCount: { increment: 1 } } });
    }

    await tx.notification.create({
      data: {
        userId: appointment.doctorId,
        message: `New ${appointment.type.toLowerCase()} consultation confirmed for ${appointment.scheduledAt.toLocaleString('en-IN', {
          dateStyle: 'medium',
          timeStyle: 'short',
          timeZone: 'Asia/Kolkata',
        })} IST.`,
        type: 'APPOINTMENT',
      },
    });
    return true;
  });

  if (transitioned) {
    try {
      const [patUser, docUser] = await Promise.all([
        prisma.user.findUnique({ where: { id: appointment.patientId } }),
        prisma.user.findUnique({ where: { id: appointment.doctorId } }),
      ]);
      if (patUser && docUser) {
        const meetUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://ayurcare-delta.vercel.app'}/meet/${appointmentId}`;
        const base = { doctorName: docUser.name, patientName: patUser.name, scheduledAt: appointment.scheduledAt, meetUrl };
        await sendAppointmentConfirmationEmail({ ...base, toEmail: patUser.email, recipientName: patUser.name, isDoctor: false });
        await sendAppointmentConfirmationEmail({ ...base, toEmail: docUser.email, recipientName: docUser.name, isDoctor: true });
      }
    } catch (e) {
      console.error('[booking] confirmation email failed', e);
    }
  }
  return transitioned;
}

/** Payment failed or was abandoned: free the slot. */
export async function cancelPendingBooking(appointmentId: string) {
  await prisma.$transaction([
    prisma.payment.updateMany({ where: { appointmentId, status: 'PENDING' }, data: { status: 'FAILED' } }),
    prisma.appointment.updateMany({ where: { id: appointmentId, status: 'PENDING' }, data: { status: 'CANCELLED' } }),
  ]);
}
