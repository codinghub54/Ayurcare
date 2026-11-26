import { NextResponse } from 'next/server';
import { OAuth2Client } from 'google-auth-library';
import { prisma } from '@/lib/db';
import { setAuthCookies } from '@/lib/jwt';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const oauthClient = new OAuth2Client();

/**
 * Google Sign-In for patients.
 *
 * The client sends the ID token ("credential") issued by Google Identity Services.
 * The token's signature, audience and expiry are verified against Google before any
 * account is looked up. Email addresses supplied directly by the client are never trusted.
 */
export async function POST(request: Request) {
  try {
    if (!GOOGLE_CLIENT_ID) {
      return NextResponse.json({ error: 'Google sign-in is not configured.' }, { status: 503 });
    }

    const body = await request.json().catch(() => ({}));
    const idToken: unknown = body?.credential;

    if (typeof idToken !== 'string' || idToken.length < 20) {
      return NextResponse.json({ error: 'Missing Google credential.' }, { status: 400 });
    }

    let payload;
    try {
      const ticket = await oauthClient.verifyIdToken({ idToken, audience: GOOGLE_CLIENT_ID });
      payload = ticket.getPayload();
    } catch {
      return NextResponse.json({ error: 'Google credential could not be verified.' }, { status: 401 });
    }

    if (!payload?.email || payload.email_verified !== true) {
      return NextResponse.json({ error: 'Your Google account email is not verified.' }, { status: 401 });
    }

    const email = payload.email.toLowerCase();
    const name = payload.name || email.split('@')[0];

    let user = await prisma.user.findUnique({ where: { email } });

    if (user) {
      // Google sign-in is a patient-only convenience. Doctors and admins must use
      // their own portals (admins additionally require SMS second factor).
      if (user.role !== 'PATIENT') {
        return NextResponse.json(
          { error: 'This email belongs to a practitioner or staff account. Please sign in through your own portal.' },
          { status: 403 }
        );
      }

      if (user.status === 'SUSPENDED' || user.status === 'BANNED') {
        return NextResponse.json(
          {
            error: `Your account is ${user.status.toLowerCase()}. Reason: ${user.suspensionReason || 'Violation of terms'}`,
          },
          { status: 403 }
        );
      }

      if (user.status === 'PENDING' || !user.emailVerified) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { status: 'ACTIVE', emailVerified: true },
        });
      }
    } else {
      // First Google sign-in: create a patient account with an unusable random password.
      const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);

      user = await prisma.$transaction(async (tx: any) => {
        const newUser = await tx.user.create({
          data: {
            email,
            name,
            passwordHash,
            role: 'PATIENT',
            status: 'ACTIVE',
            emailVerified: true,
          },
        });

        await tx.patientProfile.create({
          data: {
            userId: newUser.id,
            lifestyleData: '{}',
          },
        });

        return newUser;
      });
    }

    if (!user) {
      return NextResponse.json({ error: 'Failed to authenticate user' }, { status: 400 });
    }

    await setAuthCookies({ id: user.id, role: user.role, name: user.name });

    await prisma.auditLog.create({
      data: {
        actorUserId: user.id,
        action: 'GOOGLE_OAUTH_LOGIN',
        metadata: JSON.stringify({ email: user.email }),
      },
    });

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        status: user.status,
      },
    });
  } catch (error: any) {
    console.error('Google OAuth Login Error:', error);
    return NextResponse.json({ error: 'Authentication failed' }, { status: 500 });
  }
}
