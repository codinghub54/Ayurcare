import { apiError } from '@/lib/api-error';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAccessToken } from '@/lib/jwt';
import { prisma } from '@/lib/db';

async function verifyAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get('accessToken')?.value;
  if (!token) return null;
  const payload = verifyAccessToken(token);
  if (!payload || payload.role !== 'ADMIN') return null;
  return payload;
}

export async function GET() {
  try {
    const admin = await verifyAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized: Admin access required' }, { status: 401 });
    }

    const checks: any = {};
    let overallStatus: 'HEALTHY' | 'DEGRADED' | 'DOWN' = 'HEALTHY';

    // 1. Database Check
    const dbStartTime = Date.now();
    try {
      await prisma.user.count();
      const dbLatency = Date.now() - dbStartTime;
      checks.database = {
        status: 'UP',
        latencyMs: dbLatency,
        provider: 'Neon PostgreSQL',
      };
    } catch (e: any) {
      checks.database = { status: 'DOWN', error: e.message };
      overallStatus = 'DOWN';
    }

    // 2. Razorpay payment gateway check
    const rzpKey = (process.env.RAZORPAY_KEY_ID || '').trim();
    if (rzpKey && (process.env.RAZORPAY_KEY_SECRET || '').trim() && (rzpKey.startsWith('rzp_test_') || rzpKey.startsWith('rzp_live_'))) {
      checks.payments = {
        status: 'UP',
        provider: 'Razorpay',
        mode: rzpKey.startsWith('rzp_live_') ? 'LIVE' : 'TEST',
        configured: true,
        webhook: !!process.env.RAZORPAY_WEBHOOK_SECRET,
      };
    } else {
      checks.payments = {
        status: 'DEGRADED',
        provider: 'Razorpay',
        error: 'Razorpay keys are not configured',
        configured: false,
      };
      if (overallStatus !== 'DOWN') overallStatus = 'DEGRADED';
    }

    // 3. Gemini AI Assistant Check
    const geminiKey = process.env.GEMINI_API_KEY;
    if (geminiKey && geminiKey.length > 10 && !geminiKey.includes('mock')) {
      checks.aiAssistant = {
        status: 'UP',
        provider: 'Google Gemini AI',
        configured: true,
      };
    } else {
      checks.aiAssistant = {
        status: 'DEGRADED',
        provider: 'Google Gemini AI',
        error: 'Gemini API key unconfigured or mock',
        configured: false,
      };
      if (overallStatus !== 'DOWN') overallStatus = 'DEGRADED';
    }

    // 4. SMTP Email Service Check
    const smtpEmail = process.env.SMTP_FROM_EMAIL;
    const smtpPass = process.env.SMTP_PASSWORD;
    if (smtpEmail && smtpPass && smtpPass.length >= 8) {
      checks.email = {
        status: 'UP',
        sender: smtpEmail,
        configured: true,
      };
    } else {
      checks.email = {
        status: 'DEGRADED',
        error: 'SMTP credentials incomplete',
        configured: false,
      };
      if (overallStatus !== 'DOWN') overallStatus = 'DEGRADED';
    }

    return NextResponse.json({
      status: overallStatus,
      timestamp: new Date().toISOString(),
      checks,
    });
  } catch (error: any) {
    console.error('System health check error:', error);
    return apiError(error, 'Health check failed');
  }
}
