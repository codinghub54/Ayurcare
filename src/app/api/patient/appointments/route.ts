import { apiError } from '@/lib/api-error';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAccessToken } from '@/lib/jwt';
import { prisma } from '@/lib/db';

async function verifyPatient() {
  const cookieStore = await cookies();
  const token = cookieStore.get('accessToken')?.value;
  if (!token) return null;
  const payload = verifyAccessToken(token);
  if (!payload || payload.role !== 'PATIENT') return null;
  return payload;
}

export async function GET() {
  try {
    const patient = await verifyPatient();
    if (!patient) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const appointments = await prisma.appointment.findMany({
      where: { patientId: patient.userId },
      include: {
        doctor: {
          include: {
            user: {
              select: { name: true, email: true },
            },
          },
        },
        familyMember: true,
        // Never send the doctor's private notes to the patient
        consultation: { select: { id: true, diagnosis: true, notes: true, startedAt: true, endedAt: true } },
      },
      orderBy: { scheduledAt: 'asc' },
    });

    return NextResponse.json({ appointments });
  } catch (error: any) {
    console.error('Fetch appointments error:', error);
    return apiError(error, 'An error occurred');
  }
}

/**
 * Retired: bookings are now created by POST /api/patient/checkout, which prices
 * the consultation on the server and ties it to a verified Razorpay payment.
 */
export async function POST() {
  return NextResponse.json(
    { error: 'Please book through the consultation booking screen.' },
    { status: 410 }
  );
}
