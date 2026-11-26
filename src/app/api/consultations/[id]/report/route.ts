import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { apiError, PublicError } from '@/lib/api-error';
import { getRoomAccess, ensureDraft, cleanMedicines, loadReport } from '@/lib/consultation';

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : undefined);

/**
 * Doctor autosave during the consultation. The patient sees the summary and
 * prescription update live; privateDoctorNotes are never shown to the patient.
 * Body (all optional): { diagnosis, notes, privateDoctorNotes, dietInstructions, lifestyleAdvice, medicines[] }
 */
export async function PUT(request: Request, props: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await props.params;
    const { me, appointment } = await getRoomAccess(id);
    if (me.role !== 'DOCTOR') throw new PublicError('Only the doctor can edit this consultation.', 403);

    const body = await request.json().catch(() => ({}));
    const { consultation, rx } = await ensureDraft(id, appointment.doctorId, appointment.patientId);

    // Private notes stay editable after the consultation ends; the shared report does not
    const editingShared =
      body.diagnosis !== undefined ||
      body.notes !== undefined ||
      body.dietInstructions !== undefined ||
      body.lifestyleAdvice !== undefined ||
      body.medicines !== undefined;
    if (editingShared && consultation.endedAt) {
      throw new PublicError('This consultation is complete. The prescription and summary can no longer be changed.', 409);
    }

    const consultationUpdate: Record<string, string> = {};
    const d = text(body.diagnosis, 4000);
    const n = text(body.notes, 10000);
    const p = text(body.privateDoctorNotes, 10000);
    if (d !== undefined) consultationUpdate.diagnosis = d;
    if (n !== undefined) consultationUpdate.notes = n;
    if (p !== undefined) consultationUpdate.privateDoctorNotes = p;

    const rxUpdate: Record<string, string> = {};
    const diet = text(body.dietInstructions, 5000);
    const life = text(body.lifestyleAdvice, 5000);
    if (diet !== undefined) rxUpdate.dietInstructions = diet;
    if (life !== undefined) rxUpdate.lifestyleAdvice = life;
    if (body.medicines !== undefined) rxUpdate.medicines = JSON.stringify(cleanMedicines(body.medicines));

    await prisma.$transaction([
      ...(Object.keys(consultationUpdate).length
        ? [prisma.consultation.update({ where: { id: consultation.id }, data: consultationUpdate })]
        : []),
      // Always touch the prescription so updatedAt marks the latest edit for the patient's live view
      prisma.prescription.update({ where: { id: rx.id }, data: rxUpdate }),
    ]);

    const report = await loadReport(id, true);
    return NextResponse.json({ ok: true, savedAt: new Date().toISOString(), report });
  } catch (error) {
    return apiError(error, 'Could not save. Your changes will be retried.');
  }
}
