'use client';

import React, { Suspense } from 'react';
import { useAuth } from '@/context/AuthContext';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  CalendarPlus,
  FileText,
  LockKeyhole,
  Wind,
  BookOpen,
  Utensils,
  Home,
  Flower2,
  User,
  Sparkles,
} from 'lucide-react';
import PortalShell, { type PortalNavGroup } from '@/components/portal/PortalShell';
import { PortalLoading, PortalNotice } from '@/components/portal/PortalStatus';

const AUTH_ROUTES = ['/patient/login', '/patient/signup', '/patient/verify-otp'];

const NAV: PortalNavGroup[] = [
  {
    items: [
      { href: '/patient/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/patient/doctors', label: 'Book a consultation', icon: CalendarPlus },
      { href: '/patient/records', label: 'Medical records', icon: FileText },
    ],
  },
  {
    title: 'Wellness',
    items: [
      { href: '/patient/yoga', label: 'Yoga guide', icon: Flower2 },
      { href: '/patient/meditation', label: 'Meditation', icon: Sparkles },
      { href: '/patient/breathing', label: 'Breathing', icon: Wind },
      { href: '/patient/diet', label: 'Ayurvedic diet', icon: Utensils },
      { href: '/patient/remedies', label: 'Herb directory', icon: BookOpen },
      { href: '/patient/home-remedies', label: 'Home remedies', icon: Home },
    ],
  },
  {
    title: 'Account',
    items: [{ href: '/patient/profile', label: 'My profile', icon: User }],
  },
];

export default function PatientLayout({ children }: { children: React.ReactNode }) {
  const { user, logout, loading } = useAuth();
  const pathname = usePathname();

  if (AUTH_ROUTES.includes(pathname)) {
    return <>{children}</>;
  }

  if (loading) {
    return <PortalLoading />;
  }

  if (!user || user.role !== 'PATIENT') {
    return (
      <PortalNotice
        icon={LockKeyhole}
        title="Please sign in"
        message="Sign in to your patient account to see your dashboard, consultations and wellness tools."
        actionHref="/patient/login"
        actionLabel="Sign in"
      />
    );
  }

  return (
    <Suspense fallback={<PortalLoading />}>
      <PortalShell portalName="Patient" groups={NAV} userName={user.name} userMeta={user.email} onLogout={logout} theme="light">
        {children}
      </PortalShell>
    </Suspense>
  );
}
