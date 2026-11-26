'use client';

import React, { Suspense } from 'react';
import { useAuth } from '@/context/AuthContext';
import { usePathname } from 'next/navigation';
import {
  ShieldCheck,
  LayoutDashboard,
  Users,
  UserCheck,
  BookOpen,
  BarChart3,
  ToggleRight,
  ScrollText,
  Ticket,
  IndianRupee,
  MessagesSquare,
  LockKeyhole,
} from 'lucide-react';
import PortalShell, { type PortalNavGroup } from '@/components/portal/PortalShell';
import { PortalLoading, PortalNotice } from '@/components/portal/PortalStatus';

const NAV: PortalNavGroup[] = [
  {
    title: 'Platform',
    items: [
      { href: '/admin/dashboard', label: 'Overview', icon: LayoutDashboard },
      { href: '/admin/users', label: 'Users', icon: Users },
      { href: '/admin/approvals', label: 'Doctor verification', icon: UserCheck },
      { href: '/admin/catalog', label: 'Medicine catalogue', icon: BookOpen },
      { href: '/admin/chats', label: 'AI chat review', icon: MessagesSquare },
    ],
  },
  {
    title: 'Commerce',
    items: [{ href: '/admin/dashboard?tab=commerce', label: 'Revenue & payouts', icon: IndianRupee }],
  },
  {
    title: 'Security',
    items: [
      { href: '/admin/dashboard?tab=security', label: '2FA, roles & sessions', icon: ShieldCheck },
      { href: '/admin/audit-logs', label: 'Audit trail', icon: ScrollText },
    ],
  },
  {
    title: 'Operations',
    items: [
      { href: '/admin/dashboard?tab=ops', label: 'Feature flags & health', icon: ToggleRight },
      { href: '/admin/dashboard?tab=analytics', label: 'Analytics', icon: BarChart3 },
      { href: '/admin/tickets', label: 'Support tickets', icon: Ticket },
    ],
  },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, logout, loading } = useAuth();
  const pathname = usePathname();

  if (pathname === '/admin/login') {
    return <>{children}</>;
  }

  if (loading) {
    return <PortalLoading label="Verifying administrator access…" />;
  }

  if (!user || user.role !== 'ADMIN') {
    return (
      <PortalNotice
        icon={LockKeyhole}
        title="Administrator access required"
        message="Please sign in with an administrator account to continue."
        actionHref="/admin/login"
        actionLabel="Admin sign in"
      />
    );
  }

  return (
    <Suspense fallback={<PortalLoading label="Verifying administrator access…" />}>
      <PortalShell portalName="Admin" groups={NAV} userName={user.name} userMeta="Administrator" onLogout={logout} theme="ink">
        {children}
      </PortalShell>
    </Suspense>
  );
}
