import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAccessToken } from '@/lib/jwt';
import { prisma } from '@/lib/db';
import { apiError } from '@/lib/api-error';

/** Medicine catalogue search for the prescription editor (doctors only). */
export async function GET(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('accessToken')?.value;
    const me = token ? verifyAccessToken(token) : null;
    if (!me || me.role !== 'DOCTOR') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const q = (new URL(request.url).searchParams.get('q') || '').trim().slice(0, 60);
    const medicines = await prisma.medicine.findMany({
      where: q ? { name: { contains: q, mode: 'insensitive' } } : {},
      orderBy: { name: 'asc' },
      take: 12,
      select: { id: true, name: true, dosage: true, anupana: true },
    });
    return NextResponse.json({ medicines });
  } catch (error) {
    return apiError(error, 'Could not search medicines.');
  }
}
