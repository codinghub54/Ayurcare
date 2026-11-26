import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { apiError, PublicError } from '@/lib/api-error';
import { getRoomAccess, callWindow } from '@/lib/consultation';

const KINDS = new Set(['hello', 'description', 'candidate', 'bye']);
const MAX_PAYLOAD = 20_000;

/**
 * Send a WebRTC signalling message to the other participant.
 * Body: { kind, payload, reset?: boolean }. `reset` clears signals waiting for
 * the sender (used when joining or re-joining a call, so stale offers from an
 * earlier attempt are not replayed).
 */
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await props.params;
    const { me, peerId, appointment } = await getRoomAccess(id);
    if (appointment.status !== 'CONFIRMED') throw new PublicError('This consultation is not active.', 409);
    if (!callWindow(appointment.scheduledAt).isOpen) throw new PublicError('The call is not open at this time.', 409);

    const body = await request.json().catch(() => ({}));
    const kind = String(body?.kind || '');
    const payload = typeof body?.payload === 'string' ? body.payload : JSON.stringify(body?.payload ?? null);
    if (!KINDS.has(kind)) throw new PublicError('Invalid signal.');
    if (payload.length > MAX_PAYLOAD) throw new PublicError('Signal too large.');

    if (body?.reset === true) {
      await prisma.callSignal.deleteMany({ where: { appointmentId: id, toUserId: me.id } });
    }
    // Housekeeping: drop undelivered signals older than 2 minutes
    await prisma.callSignal.deleteMany({
      where: { appointmentId: id, createdAt: { lt: new Date(Date.now() - 2 * 60_000) } },
    });

    await prisma.callSignal.create({
      data: { appointmentId: id, fromUserId: me.id, toUserId: peerId, kind, payload },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error, 'Could not reach the other participant.');
  }
}
