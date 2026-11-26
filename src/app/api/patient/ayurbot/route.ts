import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAccessToken } from '@/lib/jwt';
import { prisma } from '@/lib/db';
import { apiError } from '@/lib/api-error';
import { generateChatCompletion } from '@/lib/ai-provider';
import { isEmergencyMessage } from '@/lib/ai';

const MAX_MESSAGES = 20;
const MAX_MESSAGE_CHARS = 2000;

const EMERGENCY_REPLY =
  'This sounds like it may need urgent medical care, and AyurBot cannot help with emergencies. ' +
  'Please call **112** (or 108 for an ambulance) or go to the nearest hospital now. ' +
  'If you are having thoughts of harming yourself, you can call the Tele-MANAS helpline on **14416**.';

function buildSystemPrompt(doshaType: string | null) {
  const prakriti = doshaType
    ? `The user's recorded Prakriti (from the AyurCare quiz) is ${doshaType.replace(/_/g, '-')}. Use it to personalise suggestions where relevant, and say when you are doing so.`
    : "The user has not recorded their Prakriti. If it matters for the answer, suggest they take the Prakriti quiz from their dashboard.";

  return `You are AyurBot, the Ayurveda knowledge assistant inside AyurCare, an Ayurvedic telehealth platform.

What you do:
- Explain Ayurvedic concepts clearly: doshas (Vata, Pitta, Kapha), Prakriti and Vikriti, Agni, Ama, dhatus, srotas, the six tastes (rasa), virya, vipaka.
- Describe herbs and classical formulations (e.g. Triphala, Ashwagandha, Chyawanprash): traditional uses, typical forms, and known cautions and interactions.
- Give practical daily-routine (Dinacharya), seasonal-routine (Ritucharya), diet (Pathya-Apathya), yoga and pranayama guidance.
- ${prakriti}

Rules:
- You are not a doctor. Never diagnose, never prescribe doses for a specific person's illness, and never tell anyone to stop or change prescribed medicine.
- For specific or persistent symptoms, recommend booking a consultation with an AyurCare physician.
- Mention relevant cautions: pregnancy, breastfeeding, children, chronic conditions, and herb-drug interactions (e.g. blood thinners, diabetes or thyroid medicine).
- If something sounds like an emergency, tell the user to call 112 or go to a hospital, and do not suggest remedies.
- Be honest about evidence: distinguish traditional Ayurvedic use from findings of modern clinical research, and say when evidence is limited.
- Do not invent sources, studies, statistics or classical verses. If you are not sure, say so.
- Stay on Ayurveda, wellness, diet and lifestyle. Politely decline unrelated requests.
- Reply in the user's language. Keep answers concise and well structured using short paragraphs, bullet lists and **bold** for key terms.`;
}

async function verifyPatient() {
  const cookieStore = await cookies();
  const token = cookieStore.get('accessToken')?.value;
  if (!token) return null;
  const payload = verifyAccessToken(token);
  if (!payload || payload.role !== 'PATIENT') return null;
  return payload;
}

export async function POST(request: Request) {
  try {
    const patient = await verifyPatient();
    if (!patient) return NextResponse.json({ error: 'Please sign in to use AyurBot.' }, { status: 401 });

    const body = await request.json().catch(() => null);
    const raw: unknown = body?.messages;
    if (!Array.isArray(raw) || raw.length === 0) {
      return NextResponse.json({ error: 'Please type a message.' }, { status: 400 });
    }

    const messages = raw
      .slice(-MAX_MESSAGES)
      .filter(
        (m): m is { role: 'user' | 'assistant'; content: string } =>
          !!m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim().length > 0
      )
      .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_CHARS) }));

    const last = messages[messages.length - 1];
    if (!last || last.role !== 'user') {
      return NextResponse.json({ error: 'Please type a message.' }, { status: 400 });
    }

    if (isEmergencyMessage(last.content)) {
      return NextResponse.json({ reply: EMERGENCY_REPLY, emergency: true });
    }

    const profile = await prisma.patientProfile.findUnique({
      where: { userId: patient.userId },
      select: { doshaType: true },
    });

    const result = await generateChatCompletion(messages, buildSystemPrompt(profile?.doshaType ?? null));
    if (!result) {
      return NextResponse.json(
        { error: 'AyurBot is not available right now. Please try again in a little while.' },
        { status: 503 }
      );
    }

    return NextResponse.json({ reply: result.text });
  } catch (error) {
    return apiError(error, 'AyurBot could not answer right now. Please try again.');
  }
}
