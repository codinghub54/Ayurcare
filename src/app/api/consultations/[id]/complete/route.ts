import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { apiError, PublicError } from '@/lib/api-error';
import { getRoomAccess, ensureDraft, loadReport } from '@/lib/consultation';
import { sendPrescriptionReadyEmail } from '@/lib/email';

/**
 * Doctor finishes the consultation: the summary and prescription become final
 * and appear in the patient's records, the appointment is marked completed and
 * the patient is notified.
 */
export async function POST(_request: Request, props: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await props.params;
    const { me, appointment } = await getRoomAccess(id);
    if (me.role !== 'DOCTOR') throw new PublicError('Only the doctor can complete the consultation.', 403);
    if (appointment.status === 'COMPLETED') return NextResponse.json({ ok: true, alreadyCompleted: true });
    if (appointment.status !== 'CONFIRMED') throw new PublicError('Only confirmed consultations can be completed.', 409);

    const { consultation, rx } = await ensureDraft(id, appointment.doctorId, appointment.patientId);
    const report = await loadReport(id, true);
    if (!report.diagnosis.trim() && !report.notes.trim() && report.medicines.length === 0) {
      throw new PublicError('Please add a summary or a prescription before completing the consultation.');
    }

    const now = new Date();
    await prisma.$transaction([
      prisma.consultation.update({ where: { id: consultation.id }, data: { endedAt: now } }),
      prisma.prescription.update({ where: { id: rx.id }, data: { status: 'ACTIVE', assignedAt: now } }),
      prisma.appointment.update({ where: { id }, data: { status: 'COMPLETED' } }),
      prisma.consultationPresence.updateMany({ where: { appointmentId: id }, data: { inCall: false } }),
      prisma.consultationMessage.create({
        data: {
          appointmentId: id,
          senderId: me.id,
          senderRole: 'SYSTEM',
          body: 'The doctor has completed this consultation. Your consultation summary and prescription are now in your records.',
        },
      }),
      prisma.notification.create({
        data: {
          userId: appointment.patientId,
          message: `Dr. ${appointment.doctor.user.name} has shared your consultation summary and prescription.`,
          type: 'PRESCRIPTION',
        },
      }),
      prisma.auditLog.create({
        data: {
          actorUserId: me.id,
          action: 'DOCTOR_COMPLETED_CONSULTATION',
          targetPatientId: appointment.patientId,
          metadata: JSON.stringify({ appointmentId: id, consultationId: consultation.id, medicines: report.medicines.length }),
        },
      }),
    ]);

    try {
      const patient = await prisma.user.findUnique({ where: { id: appointment.patientId }, select: { email: true, name: true } });
      if (patient) await sendPrescriptionReadyEmail(patient.email, patient.name, appointment.doctor.user.name);
    } catch (e) {
      console.error('[consultation] prescription email failed', e);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error, 'Could not complete the consultation.');
  }
}
