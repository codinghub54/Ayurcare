import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAccessToken } from '@/lib/jwt';
import { prisma } from '@/lib/db';
import { apiError, PublicError } from '@/lib/api-error';

/** Marks the zero-fee payment of an admin-created test consultation. */
const TEST_PAYMENT_REF = 'ADMIN_TEST_CONSULTATION';

async function verifyAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get('accessToken')?.value;
  const payload = token ? verifyAccessToken(token) : null;
  return payload?.role === 'ADMIN' ? payload : null;
}

/** Doctors and patients to choose from, plus recent test consultations. */
export async function GET() {
  try {
    const admin = await verifyAdmin();
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const [doctors, patients, tests] = await Promise.all([
      prisma.user.findMany({
        where: { role: 'DOCTOR', status: 'ACTIVE', doctorProfile: { isApproved: true } },
        select: { id: true, name: true, email: true },
        orderBy: { name: 'asc' },
        take: 200,
      }),
      prisma.user.findMany({
        where: { role: 'PATIENT', status: 'ACTIVE', patientProfile: { isNot: null } },
        select: { id: true, name: true, email: true },
        orderBy: { name: 'asc' },
        take: 200,
      }),
      prisma.appointment.findMany({
        where: { payment: { gatewayRefId: TEST_PAYMENT_REF } },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          type: true,
          status: true,
          scheduledAt: true,
          doctor: { select: { user: { select: { name: true } } } },
          patient: { select: { user: { select: { name: true } } } },
        },
      }),
    ]);

    return NextResponse.json({
      doctors,
      patients,
      tests: tests.map((t) => ({
        id: t.id,
        type: t.type,
        status: t.status,
        scheduledAt: t.scheduledAt.toISOString(),
        doctorName: t.doctor.user.name,
        patientName: t.patient.user.name,
      })),
    });
  } catch (error) {
    return apiError(error, 'Could not load test consultations.');
  }
}

/**
 * Create a free consultation that starts now, so a real call can be tested
 * between two people without booking or paying. Body: { doctorId, patientId, type }.
 */
export async function POST(request: Request) {
  try {
    const admin = await verifyAdmin();
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const type = body.type === 'AUDIO' || body.type === 'CHAT' ? body.type : 'VIDEO';
    const doctor = await prisma.doctorProfile.findFirst({
      where: { userId: String(body.doctorId || ''), isApproved: true, user: { status: 'ACTIVE' } },
      select: { userId: true },
    });
    if (!doctor) throw new PublicError('Choose an approved, active doctor.');
    const patient = await prisma.patientProfile.findFirst({
      where: { userId: String(body.patientId || ''), user: { status: 'ACTIVE' } },
      select: { userId: true },
    });
    if (!patient) throw new PublicError('Choose an active patient account.');

    const appointment = await prisma.appointment.create({
      data: {
        doctorId: doctor.userId,
        patientId: patient.userId,
        scheduledAt: new Date(),
        type,
        status: 'CONFIRMED',
        feePaid: 0,
        payment: { create: { amount: 0, commission: 0, status: 'SUCCESS', gatewayRefId: TEST_PAYMENT_REF } },
      },
      select: { id: true },
    });

    await prisma.auditLog.create({
      data: {
        actorUserId: admin.userId,
        action: 'ADMIN_CREATED_TEST_CONSULTATION',
        targetUserId: doctor.userId,
        targetPatientId: patient.userId,
        metadata: JSON.stringify({ appointmentId: appointment.id, type }),
      },
    });

    return NextResponse.json({ id: appointment.id });
  } catch (error) {
    return apiError(error, 'Could not create the test consultation.');
  }
}

/** Remove a test consultation (only ones created by this tool). Query: ?id= */
export async function DELETE(request: Request) {
  try {
    const admin = await verifyAdmin();
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const id = new URL(request.url).searchParams.get('id') || '';
    const test = await prisma.appointment.findFirst({
      where: { id, payment: { gatewayRefId: TEST_PAYMENT_REF } },
      select: { id: true, consultation: { select: { id: true } } },
    });
    if (!test) throw new PublicError('Test consultation not found.', 404);
    // Prescriptions are only unlinked (not deleted) when a consultation goes, so remove test ones explicitly
    await prisma.$transaction([
      ...(test.consultation ? [prisma.prescription.deleteMany({ where: { consultationId: test.consultation.id } })] : []),
      prisma.appointment.delete({ where: { id: test.id } }),
    ]);
    await prisma.auditLog.create({
      data: { actorUserId: admin.userId, action: 'ADMIN_DELETED_TEST_CONSULTATION', metadata: JSON.stringify({ appointmentId: id }) },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error, 'Could not delete the test consultation.');
  }
}
