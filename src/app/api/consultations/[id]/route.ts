import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { apiError } from '@/lib/api-error';
import { getRoomAccess, callWindow, iceServers, loadReport, parseMedicines } from '@/lib/consultation';

function ageFrom(dob: Date | null | undefined) {
  if (!dob) return null;
  const diff = Date.now() - dob.getTime();
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
}

/** Open a consultation room: details, call config, report so far and (for the doctor) patient context. */
export async function GET(_request: Request, props: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await props.params;
    const { me, peerId, appointment } = await getRoomAccess(id);
    const isDoctor = me.role === 'DOCTOR';

    const base = {
      appointment: {
        id: appointment.id,
        type: appointment.type,
        status: appointment.status,
        scheduledAt: appointment.scheduledAt.toISOString(),
        doctor: {
          id: appointment.doctorId,
          name: appointment.doctor.user.name,
          qualification: appointment.doctor.qualification,
          specializations: appointment.doctor.specializations,
        },
        patient: { id: appointment.patientId, name: appointment.patient.user.name },
      },
      me,
      peerId,
      window: callWindow(appointment.scheduledAt),
      iceServers: iceServers(),
      report: await loadReport(appointment.id, isDoctor),
    };

    if (!isDoctor) return NextResponse.json(base);

    // ---- Patient context for the doctor ----
    const [profile, familyMember, visits, labReports] = await Promise.all([
      prisma.patientProfile.findUnique({
        where: { userId: appointment.patientId },
        select: { dob: true, gender: true, bloodGroup: true, doshaType: true, allergies: true, chronicConditions: true },
      }),
      appointment.familyMemberId
        ? prisma.familyMember.findUnique({
            where: { id: appointment.familyMemberId },
            select: { name: true, relation: true, dob: true, gender: true },
          })
        : Promise.resolve(null),
      prisma.appointment.findMany({
        where: { patientId: appointment.patientId, id: { not: appointment.id }, status: 'COMPLETED' },
        orderBy: { scheduledAt: 'desc' },
        take: 20,
        select: {
          id: true,
          scheduledAt: true,
          type: true,
          doctorId: true,
          doctor: { select: { user: { select: { name: true } } } },
          consultation: {
            select: {
              diagnosis: true,
              notes: true,
              privateDoctorNotes: true,
              prescriptions: { select: { medicines: true }, orderBy: { assignedAt: 'desc' }, take: 1 },
            },
          },
        },
      }),
      prisma.labReport.findMany({
        where: { patientId: appointment.patientId },
        orderBy: { uploadedAt: 'desc' },
        take: 10,
        select: { id: true, description: true, uploadedAt: true, uploadedBy: true },
      }),
    ]);

    // A doctor sees their own private notes from earlier visits, never another doctor's
    const previousVisits = visits.map((v) => {
      const mine = v.doctorId === me.id;
      return {
        id: v.id,
        date: v.scheduledAt.toISOString(),
        type: v.type,
        doctorName: v.doctor.user.name,
        withMe: mine,
        diagnosis: v.consultation?.diagnosis || '',
        notes: v.consultation?.notes || '',
        privateNotes: mine ? v.consultation?.privateDoctorNotes || '' : undefined,
        medicines: parseMedicines(v.consultation?.prescriptions[0]?.medicines).map((m) => m.name),
      };
    });

    await prisma.auditLog.create({
      data: {
        actorUserId: me.id,
        action: 'DOCTOR_OPENED_CONSULTATION',
        targetPatientId: appointment.patientId,
        metadata: JSON.stringify({ appointmentId: appointment.id }),
      },
    });

    return NextResponse.json({
      ...base,
      patientContext: {
        name: familyMember?.name || appointment.patient.user.name,
        forFamilyMember: familyMember ? { relation: familyMember.relation, bookedBy: appointment.patient.user.name } : null,
        age: ageFrom(familyMember?.dob ?? profile?.dob),
        gender: familyMember?.gender ?? profile?.gender ?? null,
        bloodGroup: familyMember ? null : profile?.bloodGroup ?? null,
        prakriti: familyMember ? null : profile?.doshaType?.replace(/_/g, '-') ?? null,
        allergies: familyMember ? null : profile?.allergies ?? null,
        chronicConditions: familyMember ? null : profile?.chronicConditions ?? null,
        labReports: labReports.map((r) => ({ ...r, uploadedAt: r.uploadedAt.toISOString() })),
        previousVisits,
      },
    });
  } catch (error) {
    return apiError(error, 'Could not open this consultation.');
  }
}
