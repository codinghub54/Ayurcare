import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAccessToken } from '@/lib/jwt';
import { iceServers } from '@/lib/consultation';

/** Connection servers (STUN, plus TURN when configured) for the call test page. Signed-in users only. */
export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get('accessToken')?.value;
  const me = token ? verifyAccessToken(token) : null;
  if (!me) return NextResponse.json({ error: 'Please sign in to run the call test.' }, { status: 401 });

  const servers = iceServers();
  return NextResponse.json({
    iceServers: servers,
    turnConfigured: servers.some((s) => (Array.isArray(s.urls) ? s.urls : [s.urls]).some((u) => String(u).startsWith('turn'))),
  });
}
