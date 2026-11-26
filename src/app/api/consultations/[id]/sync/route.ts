import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { apiError } from '@/lib/api-error';
import { getRoomAccess, loadReport, PRESENCE_TIMEOUT_MS, callWindow } from '@/lib/consultation';

/**
 * Heartbeat + poll for a consultation room (works on serverless hosting, no
 * websocket server needed). Body: { after?: ISO timestamp of the newest chat
 * message the client has, inCall?: boolean }.
 *
 * Returns WebRTC signals addressed to the caller (then deletes them), new chat
 * messages, the other participant's presence and, for the patient, the live
 * prescription and consultation summary.
 */
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await props.params;
    const { me, peerId, appointment } = await getRoomAccess(id);
    const body = await request.json().catch(() => ({}));
    const inCall = body?.inCall === true && appointment.status === 'CONFIRMED';
    const after = typeof body?.after === 'string' && !Number.isNaN(Date.parse(body.after)) ? new Date(body.after) : null;

    const now = new Date();
    await prisma.consultationPresence.upsert({
      where: { appointmentId_userId: { appointmentId: id, userId: me.id } },
      update: { inCall, lastSeenAt: now },
      create: { appointmentId: id, userId: me.id, inCall, lastSeenAt: now },
    });

    const [signals, messages, peer] = await Promise.all([
      prisma.callSignal.findMany({
        where: { appointmentId: id, toUserId: me.id },
        orderBy: { createdAt: 'asc' },
        take: 200,
        select: { id: true, kind: true, payload: true },
      }),
      prisma.consultationMessage.findMany({
        where: { appointmentId: id, ...(after ? { createdAt: { gte: after } } : {}) },
        orderBy: { createdAt: 'asc' },
        take: after ? 200 : 500,
        select: { id: true, senderId: true, senderRole: true, body: true, createdAt: true },
      }),
      prisma.consultationPresence.findUnique({
        where: { appointmentId_userId: { appointmentId: id, userId: peerId } },
      }),
    ]);

    if (signals.length) {
      await prisma.callSignal.deleteMany({ where: { id: { in: signals.map((s) => s.id) } } });
    }

    const peerPresent = !!peer && now.getTime() - peer.lastSeenAt.getTime() < PRESENCE_TIMEOUT_MS;

    return NextResponse.json({
      now: now.toISOString(),
      status: appointment.status,
      window: callWindow(appointment.scheduledAt),
      peer: { present: peerPresent, inCall: peerPresent && !!peer?.inCall },
      signals: signals.map((s) => ({ kind: s.kind, payload: s.payload })),
      messages: messages.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() })),
      // The patient watches the doctor's prescription and summary update live
      ...(me.role === 'PATIENT' ? { report: await loadReport(id, false) } : {}),
    });
  } catch (error) {
    return apiError(error, 'Connection to the consultation room was interrupted.');
  }
}
