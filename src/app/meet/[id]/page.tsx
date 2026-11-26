'use client';

import { use, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

/**
 * Link used in confirmation emails (/meet/<appointmentId>). Sends each person
 * to their own side of the consultation room, or to sign in first.
 */
export default function MeetRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (user?.role === 'DOCTOR') router.replace(`/doctor/consultations/${id}`);
    else if (user?.role === 'PATIENT') router.replace(`/patient/consultations/${id}`);
    else router.replace('/patient/login');
  }, [loading, user, id, router]);

  return (
    <main className="flex min-h-screen items-center justify-center gap-2 bg-bg text-ink-muted">
      <Loader2 className="h-5 w-5 animate-spin" /> Opening your consultation…
    </main>
  );
}
