import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAccessToken } from '@/lib/jwt';
import { apiError } from '@/lib/api-error';
import { getDoctorSlots } from '@/lib/ayurbot-agent';

/** Open consultation slots (IST) for a doctor on a date: availability minus booked and past times. */
export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('accessToken')?.value;
    const payload = token ? verifyAccessToken(token) : null;
    if (!payload || payload.role !== 'PATIENT') {
      return NextResponse.json({ error: 'Please sign in to see available times.' }, { status: 401 });
    }

    const { id } = await props.params;
    const date = new URL(request.url).searchParams.get('date') || '';
    const result = await getDoctorSlots(id, date);
    if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error, 'Could not load available times.');
  }
}
