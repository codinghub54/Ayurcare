import { apiError } from '@/lib/api-error';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAccessToken } from '@/lib/jwt';
import { prisma } from '@/lib/db';
import { fetchOrderPayments, refundPayment } from '@/lib/razorpay';

async function verifyAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get('accessToken')?.value;
  if (!token) return null;
  const payload = verifyAccessToken(token);
  if (!payload || payload.role !== 'ADMIN') return null;
  return payload;
}

export async function GET() {
  try {
    const admin = await verifyAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized: Admin access required' }, { status: 401 });
    }

    const refunds = await prisma.refundRecord.findMany({
      include: {
        payment: {
          include: {
            appointment: {
              include: {
                patient: {
                  include: {
                    user: { select: { name: true, email: true } },
                  },
                },
                doctor: {
                  include: {
                    user: { select: { name: true, email: true } },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ refunds });
  } catch (error: any) {
    console.error('Fetch refunds error:', error);
    return apiError(error, 'An error occurred');
  }
}

export async function POST(request: Request) {
  try {
    const admin = await verifyAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized: Admin access required' }, { status: 401 });
    }

    const body = await request.json();
    const { paymentId, amount, reason, refundType } = body;

    if (!paymentId || !amount || !reason || !refundType) {
      return NextResponse.json(
        { error: 'Missing required refund fields: paymentId, amount, reason, refundType' },
        { status: 400 }
      );
    }

    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        appointment: true,
      },
    });

    if (!payment) {
      return NextResponse.json({ error: 'Payment record not found' }, { status: 404 });
    }

    if (payment.status !== 'SUCCESS') {
      return NextResponse.json({ error: 'Only successful payments can be refunded' }, { status: 400 });
    }

    const refundAmount = parseFloat(amount);
    if (refundAmount <= 0 || refundAmount > payment.amount) {
      return NextResponse.json(
        { error: `Refund amount must be between ₹1 and ₹${payment.amount}` },
        { status: 400 }
      );
    }

    // Gateway refund id (stored in the legacy stripeRefundId column)
    let gatewayRefundId: string | null = null;

    if (refundType === 'FULL' || refundType === 'PARTIAL') {
      // gatewayRefId holds the Razorpay order id (order_...)
      if (payment.gatewayRefId && payment.gatewayRefId.startsWith('order_')) {
        try {
          const payments = await fetchOrderPayments(payment.gatewayRefId);
          const captured = payments.find((p) => p.status === 'captured' || p.status === 'refunded');
          if (!captured) {
            return NextResponse.json({ error: 'No captured Razorpay payment found for this booking.' }, { status: 400 });
          }
          const refund = await refundPayment(captured.id, Math.round(refundAmount * 100), {
            appointmentId: payment.appointmentId,
            reason: String(reason).slice(0, 200),
          });
          gatewayRefundId = refund.id;
        } catch (gatewayError) {
          console.error('Razorpay refund failed:', gatewayError);
          return NextResponse.json({ error: 'Razorpay could not process this refund. Please try again.' }, { status: 502 });
        }
      }
    } else if (refundType === 'WALLET_CREDIT') {
      // Credit patient's wallet balance
      const patientId = payment.appointment.patientId;
      await prisma.$transaction(async (tx: any) => {
        const wallet = await tx.wallet.upsert({
          where: { userId: patientId },
          update: { balance: { increment: refundAmount } },
          create: { userId: patientId, balance: refundAmount },
        });

        await tx.walletTransaction.create({
          data: {
            walletId: wallet.userId,
            type: 'REFUND',
            amount: refundAmount,
            description: `Refund for Appointment #${payment.appointmentId}: ${reason}`,
            referenceId: payment.id,
          },
        });
      });
    }

    // Record refund in DB
    const refundRecord = await prisma.refundRecord.create({
      data: {
        paymentId: payment.id,
        amount: refundAmount,
        reason,
        refundType,
        processedBy: admin.userId,
        stripeRefundId: gatewayRefundId,
      },
    });

    // Write Audit Log
    await prisma.auditLog.create({
      data: {
        actorUserId: admin.userId,
        action: 'ADMIN_ISSUE_REFUND',
        targetUserId: payment.appointment.patientId,
        metadata: JSON.stringify({
          refundId: refundRecord.id,
          paymentId: payment.id,
          amount: refundAmount,
          reason,
          refundType,
        }),
      },
    });

    return NextResponse.json({
      message: 'Refund issued successfully!',
      refund: refundRecord,
    });
  } catch (error: any) {
    console.error('Issue refund error:', error);
    return apiError(error, 'An error occurred');
  }
}
