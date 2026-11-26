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

export async function POST(request: Request) {
  try {
    const patient = await verifyPatient();
    if (!patient) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { answers } = body; // answers is { bodyFrame, skinType, appetite, sleep, temperament, digest, voice, weatherPref }

    if (!answers) {
      return NextResponse.json({ error: 'Answers are required to calculate Prakriti' }, { status: 400 });
    }

    // Quiz evaluation algorithm (Vata vs Pitta vs Kapha scoring)
    let vata = 0;
    let pitta = 0;
    let kapha = 0;

    // Each answer value is the dosha it points to ("vata" | "pitta" | "kapha").
    // Anything else is ignored rather than silently counted.
    Object.values(answers).forEach((ans: any) => {
      const val = String(ans).toLowerCase();
      if (val === 'vata') vata++;
      else if (val === 'pitta') pitta++;
      else if (val === 'kapha') kapha++;
    });

    if (vata + pitta + kapha === 0) {
      return NextResponse.json({ error: 'No valid answers were submitted' }, { status: 400 });
    }

    // Determine dominance (ties produce dual or tri-doshic types)
    const maxVal = Math.max(vata, pitta, kapha);
    const dominant = [
      vata === maxVal ? 'VATA' : null,
      pitta === maxVal ? 'PITTA' : null,
      kapha === maxVal ? 'KAPHA' : null,
    ].filter(Boolean) as string[];
    const doshaType = dominant.length === 3 ? 'TRIDOSHA' : dominant.join('_');

    // Merge into existing lifestyle data so wellness logs and other fields are preserved
    const existing = await prisma.patientProfile.findUnique({
      where: { userId: patient.userId },
      select: { lifestyleData: true },
    });
    let lifestyle: Record<string, any> = {};
    try {
      lifestyle = existing?.lifestyleData ? JSON.parse(existing.lifestyleData) : {};
    } catch {
      lifestyle = {};
    }

    await prisma.patientProfile.update({
      where: { userId: patient.userId },
      data: {
        doshaType,
        lifestyleData: JSON.stringify({
          ...lifestyle,
          scores: { vata, pitta, kapha },
          lastQuizDate: new Date().toISOString(),
        }),
      },
    });

    // Write audit log
    await prisma.auditLog.create({
      data: {
        actorUserId: patient.userId,
        action: 'PATIENT_PRAKRITI_QUIZ',
        metadata: JSON.stringify({ doshaType, vata, pitta, kapha }),
      },
    });

    return NextResponse.json({
      message: 'Dosha evaluation completed successfully!',
      doshaType,
      scores: { vata, pitta, kapha },
    });
  } catch (error: any) {
    console.error('Prakriti quiz error:', error);
    return apiError(error, 'An error occurred');
  }
}
