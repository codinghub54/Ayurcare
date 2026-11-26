import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} must be set as an environment variable. ` +
      'Refusing to start with an insecure default.'
    );
  }
  return value;
}

const JWT_SECRET = requireEnv('JWT_SECRET');
const JWT_REFRESH_SECRET = requireEnv('JWT_REFRESH_SECRET');

export interface TokenPayload {
  userId: string;
  role: string;
  name: string;
}

export function signAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '15m' });
}

export function signRefreshToken(userId: string): string {
  // jti makes every refresh token unique so it can be stored and revoked individually
  return jwt.sign({ userId, jti: crypto.randomUUID() }, JWT_REFRESH_SECRET, { expiresIn: '7d' });
}

const ACCESS_TOKEN_MAX_AGE = 15 * 60; // 15 minutes
const REFRESH_TOKEN_MAX_AGE = 7 * 24 * 60 * 60; // 7 days

/** Refresh tokens are stored hashed, so a database leak cannot be replayed as sessions. */
export function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function verifyAccessToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
  } catch (e) {
    return null;
  }
}

export function verifyRefreshToken(token: string): { userId: string } | null {
  try {
    return jwt.verify(token, JWT_REFRESH_SECRET) as { userId: string };
  } catch (e) {
    return null;
  }
}

export async function setAuthCookies(user: { id: string; role: string; name: string }) {
  const cookieStore = await cookies();
  const accessToken = signAccessToken({ userId: user.id, role: user.role, name: user.name });
  const refreshToken = signRefreshToken(user.id);

  // Persist the refresh token so it can be rotated, revoked (sign out everywhere)
  // and invalidated on password reset.
  await prisma.refreshToken.create({
    data: {
      token: hashRefreshToken(refreshToken),
      userId: user.id,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_MAX_AGE * 1000),
    },
  });

  cookieStore.set('accessToken', accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: ACCESS_TOKEN_MAX_AGE,
    path: '/',
  });

  cookieStore.set('refreshToken', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: REFRESH_TOKEN_MAX_AGE,
    path: '/',
  });
}

export type RefreshResult =
  | { ok: true; user: { id: string; role: string; name: string; status: string } }
  | { ok: false; reason: 'missing' | 'invalid' | 'revoked' | 'blocked' };

/**
 * Exchange the refresh-token cookie for a new access + refresh token pair.
 * The old refresh token is revoked (rotation). Suspended or banned users,
 * and revoked or unknown tokens, are rejected and their cookies cleared.
 */
export async function refreshSession(): Promise<RefreshResult> {
  const cookieStore = await cookies();
  const token = cookieStore.get('refreshToken')?.value;
  if (!token) return { ok: false, reason: 'missing' };

  const payload = verifyRefreshToken(token);
  if (!payload?.userId) {
    await clearAuthCookies();
    return { ok: false, reason: 'invalid' };
  }

  const stored = await prisma.refreshToken.findUnique({ where: { token: hashRefreshToken(token) } });
  if (!stored || stored.revoked || stored.userId !== payload.userId || stored.expiresAt < new Date()) {
    await clearAuthCookies();
    return { ok: false, reason: 'revoked' };
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, role: true, name: true, status: true },
  });
  if (!user || user.status === 'SUSPENDED' || user.status === 'BANNED') {
    await prisma.refreshToken.update({ where: { id: stored.id }, data: { revoked: true } });
    await clearAuthCookies();
    return { ok: false, reason: 'blocked' };
  }

  await prisma.refreshToken.update({ where: { id: stored.id }, data: { revoked: true } });
  await setAuthCookies(user);
  return { ok: true, user };
}

/** Revoke the current refresh token (used on logout). */
export async function revokeCurrentRefreshToken() {
  const cookieStore = await cookies();
  const token = cookieStore.get('refreshToken')?.value;
  if (!token) return;
  await prisma.refreshToken.updateMany({
    where: { token: hashRefreshToken(token) },
    data: { revoked: true },
  });
}

export async function clearAuthCookies() {
  const cookieStore = await cookies();
  cookieStore.delete('accessToken');
  cookieStore.delete('refreshToken');
}
