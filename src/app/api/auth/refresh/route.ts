import { NextResponse } from 'next/server';
import { refreshSession } from '@/lib/jwt';
import { apiError } from '@/lib/api-error';

/** Called by the client when an API request returns 401, and on a timer while signed in. */
export async function POST() {
  try {
    const result = await refreshSession();
    if (!result.ok) {
      return NextResponse.json({ error: 'Your session has ended. Please sign in again.' }, { status: 401 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error, 'Could not refresh your session.');
  }
}

/** Only allow same-site relative paths as redirect targets (no open redirects). */
function safeNext(next: string | null): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return '/';
  return next;
}

function loginPathFor(next: string): string {
  if (next.startsWith('/admin')) return '/admin/login';
  if (next.startsWith('/doctor')) return '/doctor/login';
  return '/patient/login';
}

/**
 * Used by the route guard (proxy) when a page is requested after the
 * short-lived access token has expired: renew the session and continue
 * to the requested page, or go to the matching sign-in page.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get('next'));
  try {
    const result = await refreshSession();
    if (result.ok) {
      return NextResponse.redirect(new URL(next, url.origin));
    }
  } catch (error) {
    console.error('[auth] refresh on navigation failed', error);
  }
  return NextResponse.redirect(new URL(loginPathFor(next), url.origin));
}
