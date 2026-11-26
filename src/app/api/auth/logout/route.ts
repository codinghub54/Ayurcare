import { NextResponse } from 'next/server';
import { clearAuthCookies, revokeCurrentRefreshToken } from '@/lib/jwt';

export async function POST() {
  try {
    await revokeCurrentRefreshToken();
  } catch (error) {
    // Still clear cookies even if the database is unreachable
    console.error('Logout revoke error:', error);
  }
  await clearAuthCookies();
  return NextResponse.json({ message: 'Logged out successfully' });
}
