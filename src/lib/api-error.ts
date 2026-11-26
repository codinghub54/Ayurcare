import { NextResponse } from 'next/server';

/**
 * An error whose message is safe to show to the user (validation problems,
 * business-rule violations). Throw this inside a route handler when the
 * message should reach the client; every other error is replaced with a
 * generic message so internal details (database queries, stack traces,
 * connection strings, third-party responses) never leave the server.
 */
export class PublicError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'PublicError';
    this.status = status;
  }
}

const DB_UNAVAILABLE_CODES = new Set(['P1000', 'P1001', 'P1002', 'P1008', 'P1017', 'P2024']);
const NETWORK_CODES = new Set(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', '57P01', '57P03']);

/** True when the failure is the database (or its network) being unreachable. */
function isServiceUnavailable(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { name?: string; code?: string; cause?: unknown; message?: string };
  if (e.name === 'PrismaClientInitializationError') return true;
  if (e.code && (DB_UNAVAILABLE_CODES.has(e.code) || NETWORK_CODES.has(e.code))) return true;
  if (typeof e.message === 'string' && /DATABASE_URL|ECONNREFUSED|Can't reach database server|connection (?:refused|terminated)/i.test(e.message)) {
    return true;
  }
  return e.cause ? isServiceUnavailable(e.cause) : false;
}

/**
 * Log the full error on the server and return a JSON response that is safe
 * to show in the browser.
 */
export function apiError(error: unknown, fallback = 'Something went wrong. Please try again.', status = 500) {
  if (error instanceof PublicError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error(`[api] ${fallback}`, error);

  if (isServiceUnavailable(error)) {
    return NextResponse.json(
      { error: 'The service is temporarily unavailable. Please try again in a few minutes.' },
      { status: 503 }
    );
  }

  return NextResponse.json({ error: fallback }, { status });
}
