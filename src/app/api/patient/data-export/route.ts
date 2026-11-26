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
    if (!patient) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userData = await prisma.user.findUnique({
      where: { id: patient.userId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        createdAt: true,
        patientProfile: {
          include: {
            appointments: {
              include: {
                doctor: { include: { user: { select: { name: true } } } },
                consultation: { select: { id: true, diagnosis: true, notes: true, startedAt: true, endedAt: true } },
              },
            },
            labReports: true,
            prescriptions: { where: { status: { not: 'DRAFT' } } },
            aiChatSessions: {
              select: { id: true, summary: true, createdAt: true },
            },
          },
        },
      },
    });

    if (!userData) {
      return NextResponse.json({ error: 'User data not found' }, { status: 404 });
    }

    // Write audit log
    await prisma.auditLog.create({
      data: {
        actorUserId: patient.userId,
        action: 'PATIENT_EXPORT_DATA',
        metadata: JSON.stringify({ message: 'Patient requested complete data export (GDPR compliance)' }),
      },
    });

    return NextResponse.json({
      exportTimestamp: new Date().toISOString(),
      platform: 'AyurCare',
      data: userData,
    });
  } catch (error: any) {
    console.error('Data export error:', error);
    return apiError(error, 'Data export failed');
  }
}
