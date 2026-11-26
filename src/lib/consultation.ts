/**
 * Consultation room: access control, call window, ICE config and reports.
 *
 * A room belongs to one appointment and has exactly two participants: the
 * appointment's doctor and its patient. Everything else is refused.
 */
import { cookies } from 'next/headers';
import { verifyAccessToken } from '@/lib/jwt';
import { prisma } from '@/lib/db';
import { PublicError } from '@/lib/api-error';

export type RoomRole = 'DOCTOR' | 'PATIENT';

/** Participants can enter the call from 15 minutes before until 4 hours after the start time. */
export const JOIN_EARLY_MINUTES = 15;
export const JOIN_LATE_MINUTES = 240;
/** A participant counts as present if seen within this window. */
export const PRESENCE_TIMEOUT_MS = 10_000;

export interface MedicineItem {
  name: string;
  dosage: string; // e.g. "1 tablet", "3 g (½ tsp)"
  frequency: string; // e.g. "1-0-1"
  timing: string; // e.g. "After food"
  anupana: string; // vehicle, e.g. "Warm water"
  duration: string; // e.g. "14 days"
  notes: string;
}

export interface ConsultationReport {
  diagnosis: string;
  notes: string; // discussion & recommendations (visible to the patient)
  dietInstructions: string;
  lifestyleAdvice: string;
  medicines: MedicineItem[];
  privateDoctorNotes?: string; // doctor only
  status: 'DRAFT' | 'FINAL' | 'EMPTY';
  updatedAt: string | null;
}

export async function getRoomAccess(appointmentId: string) {
  const cookieStore = await cookies();
  const token = cookieStore.get('accessToken')?.value;
  const me = token ? verifyAccessToken(token) : null;
  if (!me || (me.role !== 'DOCTOR' && me.role !== 'PATIENT')) {
    throw new PublicError('Please sign in to open this consultation.', 401);
  }

  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      doctor: { select: { qualification: true, specializations: true, user: { select: { id: true, name: true } } } },
      patient: { select: { user: { select: { id: true, name: true } } } },
    },
  });
  if (!appointment) throw new PublicError('Consultation not found.', 404);

  const role: RoomRole | null =
    me.role === 'DOCTOR' && appointment.doctorId === me.userId
      ? 'DOCTOR'
      : me.role === 'PATIENT' && appointment.patientId === me.userId
        ? 'PATIENT'
        : null;
  if (!role) throw new PublicError('You are not a participant in this consultation.', 403);

  const peerId = role === 'DOCTOR' ? appointment.patientId : appointment.doctorId;
  return { me: { id: me.userId, name: me.name, role }, peerId, appointment };
}

export function callWindow(scheduledAt: Date) {
  const opensAt = new Date(scheduledAt.getTime() - JOIN_EARLY_MINUTES * 60_000);
  const closesAt = new Date(scheduledAt.getTime() + JOIN_LATE_MINUTES * 60_000);
  const now = Date.now();
  return { opensAt, closesAt, isOpen: now >= opensAt.getTime() && now <= closesAt.getTime() };
}

/** STUN always; TURN when configured (needed for some mobile and office networks). */
export function iceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
  const turnUrls = (process.env.TURN_URL || '').split(',').map((u) => u.trim()).filter(Boolean);
  if (turnUrls.length && process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) {
    servers.push({
      urls: turnUrls,
      username: process.env.TURN_USERNAME.trim(),
      credential: process.env.TURN_CREDENTIAL.trim(),
    });
  }
  return servers;
}

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');

export function cleanMedicines(input: unknown): MedicineItem[] {
  if (!Array.isArray(input)) return [];
  return input
    .slice(0, 40)
    .map((m) => {
      const o = (m && typeof m === 'object' ? m : {}) as Record<string, unknown>;
      return {
        name: text(o.name, 120).trim(),
        dosage: text(o.dosage, 80),
        frequency: text(o.frequency, 40),
        timing: text(o.timing, 60),
        anupana: text(o.anupana, 80),
        duration: text(o.duration, 40),
        notes: text(o.notes, 300),
      };
    })
    .filter((m) => m.name.length > 0);
}

/** Medicines saved by older versions used {name, dosage, frequency, anupana}; fill the rest. */
export function parseMedicines(raw: string | null | undefined): MedicineItem[] {
  try {
    return cleanMedicines(JSON.parse(raw || '[]'));
  } catch {
    return [];
  }
}

export async function loadReport(appointmentId: string, forDoctor: boolean): Promise<ConsultationReport> {
  const consultation = await prisma.consultation.findUnique({
    where: { appointmentId },
    include: { prescriptions: { orderBy: { assignedAt: 'desc' }, take: 1 } },
  });
  if (!consultation) {
    return {
      diagnosis: '',
      notes: '',
      dietInstructions: '',
      lifestyleAdvice: '',
      medicines: [],
      ...(forDoctor ? { privateDoctorNotes: '' } : {}),
      status: 'EMPTY',
      updatedAt: null,
    };
  }
  const rx = consultation.prescriptions[0];
  return {
    diagnosis: consultation.diagnosis || '',
    notes: consultation.notes || '',
    dietInstructions: rx?.dietInstructions || '',
    lifestyleAdvice: rx?.lifestyleAdvice || '',
    medicines: parseMedicines(rx?.medicines),
    ...(forDoctor ? { privateDoctorNotes: consultation.privateDoctorNotes || '' } : {}),
    status: consultation.endedAt ? 'FINAL' : 'DRAFT',
    updatedAt: (rx?.updatedAt || consultation.startedAt || null)?.toISOString() ?? null,
  };
}

/** Ensure a consultation and a single draft prescription exist for this appointment. */
export async function ensureDraft(appointmentId: string, doctorId: string, patientId: string) {
  const consultation = await prisma.consultation.upsert({
    where: { appointmentId },
    update: {},
    create: { appointmentId, startedAt: new Date() },
  });
  let rx = await prisma.prescription.findFirst({ where: { consultationId: consultation.id }, orderBy: { assignedAt: 'desc' } });
  if (!rx) {
    rx = await prisma.prescription.create({
      data: { consultationId: consultation.id, doctorId, patientId, medicines: '[]', status: 'DRAFT' },
    });
  }
  return { consultation, rx };
}
