'use client';

import React, { Suspense } from 'react';
import { useAuth } from '@/context/AuthContext';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, CalendarClock, Users, User, ShieldCheck, LockKeyhole, Hourglass } from 'lucide-react';
import PortalShell, { type PortalNavGroup } from '@/components/portal/PortalShell';
import { PortalLoading, PortalNotice } from '@/components/portal/PortalStatus';

const AUTH_ROUTES = [
  '/doctor/login',
  '/doctor/signup',
  '/doctor/pending',
  '/doctor/verify-otp',
  '/doctor/forgot-password',
  '/doctor/reset-password',
];

const NAV: PortalNavGroup[] = [
  {
    items: [
      { href: '/doctor/dashboard', label: "Today's queue", icon: LayoutDashboard },
      { href: '/doctor/schedule', label: 'Availability', icon: CalendarClock },
      { href: '/doctor/patients', label: 'Patients', icon: Users },
    ],
  },
  {
    title: 'Practice',
    items: [{ href: '/doctor/profile', label: 'Practice profile', icon: User }],
  },
];

export default function DoctorLayout({ children }: { children: React.ReactNode }) {
  const { user, logout, loading } = useAuth();
  const pathname = usePathname();

  if (AUTH_ROUTES.includes(pathname)) {
    return <>{children}</>;
  }

  if (loading) {
    return <PortalLoading label="Opening your clinic…" />;
  }

  if (!user || user.role !== 'DOCTOR') {
    return (
      <PortalNotice
        icon={LockKeyhole}
        title="Physician sign-in required"
        message="This area is for approved AyurCare physicians. Please sign in with your physician account."
        actionHref="/doctor/login"
        actionLabel="Physician sign in"
      />
    );
  }

  if (user.status === 'PENDING') {
    return (
      <PortalNotice
        icon={Hourglass}
        tone="warning"
        title="Application under review"
        message="Our team is reviewing your credentials. You'll be able to use the clinic workspace once your application is approved."
        actionHref="/doctor/pending"
        actionLabel="View application status"
      />
    );
  }

  return (
    <Suspense fallback={<PortalLoading label="Opening your clinic…" />}>
      <PortalShell
        portalName="Clinic"
        groups={NAV}
        userName={user.name}
        userMeta={
          <span className="inline-flex items-center gap-1">
            <ShieldCheck className="h-3 w-3" /> Approved physician
          </span>
        }
        onLogout={logout}
        theme="forest"
      >
        {children}
      </PortalShell>
    </Suspense>
  );
}
