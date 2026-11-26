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

    // Drafts the doctor is still writing during a live consultation are not shown until completed
    const prescriptions = await prisma.prescription.findMany({
      where: { patientId: patient.userId, status: { not: 'DRAFT' } },
      include: {
        doctor: {
          include: {
            user: { select: { name: true } },
          },
        },
        consultation: { select: { appointmentId: true } },
      },
      orderBy: { assignedAt: 'desc' },
    });

    const labReports = await prisma.labReport.findMany({
      where: { patientId: patient.userId },
      orderBy: { uploadedAt: 'desc' },
    });

    const appointments = await prisma.appointment.findMany({
      where: {
        patientId: patient.userId,
        status: 'COMPLETED',
      },
      include: {
        doctor: {
          include: {
            user: { select: { name: true } },
          },
        },
        // Never send the doctor's private notes to the patient
        consultation: { select: { id: true, diagnosis: true, notes: true, startedAt: true, endedAt: true } },
      },
      orderBy: { scheduledAt: 'desc' },
    });

    const profile = await prisma.patientProfile.findUnique({
      where: { userId: patient.userId },
      select: { doshaType: true, lifestyleData: true },
    });

    return NextResponse.json({
      prescriptions,
      labReports,
      pastConsultations: appointments,
      profile,
    });
  } catch (error: any) {
    console.error('Fetch records error:', error);
    return apiError(error, 'An error occurred');
  }
}
export async function POST(request: Request) {
  // Support file uploading metadata (like custom report upload by patient)
  try {
    const patient = await verifyPatient();
    if (!patient) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { fileUrl, description } = body;

    if (!fileUrl) {
      return NextResponse.json({ error: 'File URL is required' }, { status: 400 });
    }

    const report = await prisma.labReport.create({
      data: {
        patientId: patient.userId,
        fileUrl,
        description: description || 'Patient uploaded document',
        uploadedBy: 'PATIENT',
      },
    });

    return NextResponse.json({
      message: 'Report uploaded successfully',
      report,
    });
  } catch (error: any) {
    console.error('Upload report metadata error:', error);
    return apiError(error, 'An error occurred');
  }
}
