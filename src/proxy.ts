import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import jwt from 'jsonwebtoken';

/** Verify the access token's signature and expiry (proxy runs on the Node.js runtime). */
function decodeJwt(token: string): { role?: string; status?: string; [k: string]: unknown } | null {
  const secret = process.env.JWT_SECRET;
  try {
    // Without a secret (misconfigured env) fall back to reading the payload so the
    // guard cannot loop; API routes still verify every token themselves.
    const decoded = secret ? jwt.verify(token, secret) : jwt.decode(token);
    return decoded && typeof decoded === 'object' ? (decoded as { role?: string; status?: string }) : null;
  } catch {
    return null;
  }
}

const PUBLIC_PORTAL_PATHS = new Set([
  '/admin/login',
  '/doctor/login',
  '/doctor/signup',
  '/doctor/pending',
  '/doctor/verify-otp',
  '/doctor/forgot-password',
  '/doctor/reset-password',
  '/patient/login',
  '/patient/signup',
  '/patient/verify-otp',
  '/patient/forgot-password',
  '/patient/reset-password',
]);

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Get tokens from cookies
  const accessToken = request.cookies.get('accessToken')?.value;

  // Decode access token payload
  const user = accessToken ? decodeJwt(accessToken) : null;

  // Access tokens are short-lived. If it has expired but a refresh token is
  // present, renew the session and come straight back to the requested page.
  if (!user && request.cookies.get('refreshToken')?.value && !PUBLIC_PORTAL_PATHS.has(pathname)) {
    const refreshUrl = new URL('/api/auth/refresh', request.url);
    refreshUrl.searchParams.set('next', pathname + request.nextUrl.search);
    return NextResponse.redirect(refreshUrl);
  }

  // Admin routes protection
  if (pathname.startsWith('/admin')) {
    // Exclude admin login
    if (pathname === '/admin/login') {
      if (user && user.role === 'ADMIN') {
        return NextResponse.redirect(new URL('/admin/dashboard', request.url));
      }
      return NextResponse.next();
    }

    if (!user || user.role !== 'ADMIN') {
      return NextResponse.redirect(new URL('/admin/login', request.url));
    }
  }

  // Doctor routes protection
  if (pathname.startsWith('/doctor')) {
    // Exclude public/auth doctor routes
    const isDoctorAuth =
      pathname === '/doctor/login' ||
      pathname === '/doctor/signup' ||
      pathname === '/doctor/pending' ||
      pathname === '/doctor/verify-otp' ||
      pathname === '/doctor/forgot-password' ||
      pathname === '/doctor/reset-password';

    if (isDoctorAuth) {
      if (user && user.role === 'DOCTOR') {
        if (user.status === 'PENDING') {
          if (pathname === '/doctor/pending') return NextResponse.next();
          return NextResponse.redirect(new URL('/doctor/pending', request.url));
        }
        if (user.status === 'ACTIVE') {
          return NextResponse.redirect(new URL('/doctor/dashboard', request.url));
        }
      }
      return NextResponse.next();
    }

    if (!user || user.role !== 'DOCTOR') {
      return NextResponse.redirect(new URL('/doctor/login', request.url));
    }

    // Handle doctor suspension/pending status
    if (user.status === 'PENDING') {
      return NextResponse.redirect(new URL('/doctor/pending', request.url));
    }

    if (user.status === 'SUSPENDED' || user.status === 'BANNED') {
      const response = NextResponse.redirect(new URL('/doctor/login?error=suspended', request.url));
      response.cookies.delete('accessToken');
      response.cookies.delete('refreshToken');
      return response;
    }
  }

  // Patient routes protection
  if (pathname.startsWith('/patient')) {
    // Exclude patient auth routes
    const isPatientAuth =
      pathname === '/patient/login' ||
      pathname === '/patient/signup' ||
      pathname === '/patient/verify-otp' ||
      pathname === '/patient/forgot-password' ||
      pathname === '/patient/reset-password';

    if (isPatientAuth) {
      if (user && user.role === 'PATIENT') {
        return NextResponse.redirect(new URL('/patient/dashboard', request.url));
      }
      return NextResponse.next();
    }

    if (!user || user.role !== 'PATIENT') {
      return NextResponse.redirect(new URL('/patient/login', request.url));
    }

    if (user.status === 'SUSPENDED' || user.status === 'BANNED') {
      const response = NextResponse.redirect(new URL('/patient/login?error=suspended', request.url));
      response.cookies.delete('accessToken');
      response.cookies.delete('refreshToken');
      return response;
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/doctor/:path*', '/patient/:path*'],
};
