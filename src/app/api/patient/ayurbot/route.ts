import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAccessToken } from '@/lib/jwt';
import { prisma } from '@/lib/db';
import { apiError } from '@/lib/api-error';
import { isEmergencyMessage } from '@/lib/ai';
import { runAyurBot, buildSystemPrompt, type AyurBotAction, type ChatTurn } from '@/lib/ayurbot-agent';

const MAX_HISTORY = 20;
const MAX_MESSAGE_CHARS = 2000;

type StoredMessage = ChatTurn & { actions?: AyurBotAction[]; emergency?: boolean };

const EMERGENCY_REPLY =
  'This sounds like it may need urgent medical care, and I cannot help with emergencies. ' +
  'Please call **112** (or **108** for an ambulance) or go to the nearest hospital now. ' +
  'If you are having thoughts of harming yourself, please call the Tele-MANAS helpline on **14416**.';

async function verifyPatient() {
  const cookieStore = await cookies();
  const token = cookieStore.get('accessToken')?.value;
  if (!token) return null;
  const payload = verifyAccessToken(token);
  if (!payload || payload.role !== 'PATIENT') return null;
  return payload;
}

function parseMessages(raw: string | null): StoredMessage[] {
  try {
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed.filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string') : [];
  } catch {
    return [];
  }
}

/** Restore the patient's most recent conversation (last 24 hours). */
export async function GET() {
  try {
    const patient = await verifyPatient();
    if (!patient) return NextResponse.json({ error: 'Please sign in to use AyurBot.' }, { status: 401 });

    const session = await prisma.aIChatSession.findFirst({
      where: { patientId: patient.userId, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      orderBy: { createdAt: 'desc' },
    });
    if (!session) return NextResponse.json({ sessionId: null, messages: [] });
    return NextResponse.json({ sessionId: session.id, messages: parseMessages(session.messages) });
  } catch (error) {
    return apiError(error, 'Could not load your conversation.');
  }
}

export async function POST(request: Request) {
  try {
    const patient = await verifyPatient();
    if (!patient) return NextResponse.json({ error: 'Please sign in to use AyurBot.' }, { status: 401 });

    const body = await request.json().catch(() => null);
    const message = typeof body?.message === 'string' ? body.message.trim().slice(0, MAX_MESSAGE_CHARS) : '';
    if (!message) return NextResponse.json({ error: 'Please type a message.' }, { status: 400 });

    // Continue only the patient's own session
    let session =
      typeof body?.sessionId === 'string'
        ? await prisma.aIChatSession.findFirst({ where: { id: body.sessionId, patientId: patient.userId } })
        : null;
    if (!session) {
      session = await prisma.aIChatSession.create({
        data: { patientId: patient.userId, messages: '[]', summary: message.slice(0, 60) },
      });
    }

    const stored = parseMessages(session.messages);
    stored.push({ role: 'user', content: message });

    let reply: StoredMessage;
    let flagged = session.flaggedForReview;

    if (isEmergencyMessage(message)) {
      reply = { role: 'assistant', content: EMERGENCY_REPLY, emergency: true };
      flagged = true; // surfaces in the admin "AI chat review" queue
    } else {
      const profile = await prisma.patientProfile.findUnique({
        where: { userId: patient.userId },
        select: { doshaType: true },
      });
      const history: ChatTurn[] = stored.slice(-MAX_HISTORY).map(({ role, content }) => ({ role, content }));
      const result = await runAyurBot(history, buildSystemPrompt(patient.name, profile?.doshaType ?? null), patient.userId);
      if (!result) {
        return NextResponse.json(
          { error: 'AyurBot is not available right now. Please try again in a little while.' },
          { status: 503 }
        );
      }
      reply = { role: 'assistant', content: result.reply, ...(result.actions.length ? { actions: result.actions } : {}) };
    }

    stored.push(reply);
    await prisma.aIChatSession.update({
      where: { id: session.id },
      data: { messages: JSON.stringify(stored), flaggedForReview: flagged },
    });

    return NextResponse.json({ sessionId: session.id, reply });
  } catch (error) {
    return apiError(error, 'AyurBot could not answer right now. Please try again.');
  }
}
