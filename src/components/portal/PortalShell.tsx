'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { LogOut, Menu, X, type LucideIcon } from 'lucide-react';
import { LogoMark } from '@/components/brand/Logo';

export interface PortalNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export interface PortalNavGroup {
  title?: string;
  items: PortalNavItem[];
}

interface PortalShellProps {
  portalName: string;
  groups: PortalNavGroup[];
  userName: string;
  userMeta?: React.ReactNode;
  onLogout: () => void;
  theme?: 'light' | 'forest' | 'ink';
  children: React.ReactNode;
}

const THEMES = {
  light: {
    aside: 'bg-white border-r border-line',
    brand: 'text-ink',
    sub: 'text-ink-muted',
    group: 'text-ink-muted/70',
    item: 'text-ink-muted hover:bg-sage/70 hover:text-ink',
    active: 'bg-forest text-white shadow-[0_8px_20px_-12px_rgba(30,90,67,0.8)]',
    footer: 'border-line',
    avatar: 'bg-sage text-forest',
    name: 'text-ink',
    logout: 'text-ink-muted hover:bg-rose-50 hover:text-rose-700',
    logoTone: 'dark' as const,
  },
  forest: {
    aside: 'bg-forest-deep text-white bg-leaf-pattern',
    brand: 'text-white',
    sub: 'text-white/55',
    group: 'text-white/40',
    item: 'text-white/70 hover:bg-white/10 hover:text-white',
    active: 'bg-white text-forest-deep',
    footer: 'border-white/10',
    avatar: 'bg-white/10 text-gold-300',
    name: 'text-white',
    logout: 'text-white/70 hover:bg-white/10 hover:text-white',
    logoTone: 'light' as const,
  },
  ink: {
    aside: 'bg-[#0E1A14] text-white border-r border-white/5',
    brand: 'text-white',
    sub: 'text-white/50',
    group: 'text-white/35',
    item: 'text-white/65 hover:bg-white/5 hover:text-white',
    active: 'bg-white/10 text-white ring-1 ring-white/10',
    footer: 'border-white/10',
    avatar: 'bg-saffron/20 text-gold-300',
    name: 'text-white',
    logout: 'text-white/65 hover:bg-rose-500/10 hover:text-rose-200',
    logoTone: 'light' as const,
  },
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

export default function PortalShell({
  portalName,
  groups,
  userName,
  userMeta,
  onLogout,
  theme = 'light',
  children,
}: PortalShellProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const t = THEMES[theme];

  const currentTab = searchParams.get('tab');
  const isActive = (href: string) => {
    const [path, query] = href.split('?');
    if (query) {
      const tab = new URLSearchParams(query).get('tab');
      return pathname === path && currentTab === tab;
    }
    if (pathname === path) return !currentTab || !groups.some((g) => g.items.some((i) => i.href.startsWith(`${path}?`)));
    return pathname.startsWith(`${path}/`);
  };

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-5 pt-6 pb-5">
        <Link href="/" className="flex items-center gap-2.5" aria-label="AyurCare home">
          <LogoMark tone={t.logoTone} className="h-8 w-8" />
          <span className="leading-none">
            <span className={`block font-display text-lg font-semibold ${t.brand}`}>AyurCare</span>
            <span className={`mt-1 block text-[10px] font-semibold uppercase tracking-[0.16em] ${t.sub}`}>{portalName}</span>
          </span>
        </Link>
        <button className={`lg:hidden rounded-lg p-1.5 ${t.sub}`} onClick={() => setOpen(false)} aria-label="Close menu">
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4" aria-label={`${portalName} navigation`}>
        {groups.map((group, gi) => (
          <div key={group.title || gi} className={gi > 0 ? 'mt-5' : ''}>
            {group.title && (
              <p className={`px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.14em] ${t.group}`}>{group.title}</p>
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = isActive(item.href);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      onClick={() => setOpen(false)}
                      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-medium transition ${
                        active ? t.active : t.item
                      }`}
                    >
                      <Icon className="h-[18px] w-[18px] shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className={`border-t px-4 py-4 ${t.footer}`}>
        <div className="flex items-center gap-3 px-1">
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${t.avatar}`}>
            {initials(userName) || '•'}
          </span>
          <div className="min-w-0 flex-1">
            <p className={`truncate text-sm font-semibold ${t.name}`}>{userName}</p>
            {userMeta && <div className={`truncate text-[11px] ${t.sub}`}>{userMeta}</div>}
          </div>
        </div>
        <button
          onClick={onLogout}
          className={`mt-3 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-medium transition cursor-pointer ${t.logout}`}
        >
          <LogOut className="h-[18px] w-[18px]" />
          Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div className={`min-h-screen lg:flex ${theme === 'ink' ? 'bg-slate-950' : 'bg-bg'}`}>
      {/* Desktop sidebar */}
      <aside className={`hidden lg:block w-[264px] shrink-0 sticky top-0 h-screen ${t.aside}`}>{sidebar}</aside>

      {/* Mobile top bar */}
      <div
        className={`lg:hidden sticky top-0 z-40 flex h-14 items-center justify-between px-4 ${
          theme === 'light' ? 'bg-white/90 backdrop-blur border-b border-line' : `${t.aside}`
        }`}
      >
        <Link href="/" className="flex items-center gap-2">
          <LogoMark tone={t.logoTone} className="h-7 w-7" />
          <span className={`font-display text-base font-semibold ${t.brand}`}>AyurCare</span>
          <span className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${t.sub}`}>· {portalName}</span>
        </Link>
        <button onClick={() => setOpen(true)} className={`rounded-lg p-2 ${t.brand}`} aria-label="Open menu" aria-expanded={open}>
          <Menu className="h-5 w-5" />
        </button>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40 animate-fadeIn" onClick={() => setOpen(false)} />
          <aside className={`absolute inset-y-0 left-0 w-[280px] max-w-[85vw] shadow-2xl animate-slideUp ${t.aside}`}>{sidebar}</aside>
        </div>
      )}

      <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-10">{children}</main>
    </div>
  );
}
