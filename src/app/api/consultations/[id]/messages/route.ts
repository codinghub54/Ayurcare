import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { apiError, PublicError } from '@/lib/api-error';
import { getRoomAccess } from '@/lib/consultation';

/** Send a chat message in the consultation room. Body: { body }. */
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await props.params;
    const { me, appointment } = await getRoomAccess(id);
    if (appointment.status !== 'CONFIRMED') {
      throw new PublicError('This consultation has ended, so chat is closed.', 409);
    }

    const payload = await request.json().catch(() => ({}));
    const text = typeof payload?.body === 'string' ? payload.body.trim().slice(0, 2000) : '';
    if (!text) throw new PublicError('Please type a message.');

    const message = await prisma.consultationMessage.create({
      data: { appointmentId: id, senderId: me.id, senderRole: me.role, body: text },
      select: { id: true, senderId: true, senderRole: true, body: true, createdAt: true },
    });
    return NextResponse.json({ message: { ...message, createdAt: message.createdAt.toISOString() } });
  } catch (error) {
    return apiError(error, 'Message could not be sent.');
  }
}
