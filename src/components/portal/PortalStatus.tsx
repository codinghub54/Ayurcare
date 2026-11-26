import Link from 'next/link';
import { Loader2, type LucideIcon } from 'lucide-react';
import { LogoMark } from '@/components/brand/Logo';

export function PortalLoading({ label = 'Loading your workspace…' }: { label?: string }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-bg text-ink-muted">
      <LogoMark className="h-10 w-10 animate-pulse" />
      <span className="flex items-center gap-2 text-sm font-medium">
        <Loader2 className="h-4 w-4 animate-spin" /> {label}
      </span>
    </div>
  );
}

interface PortalNoticeProps {
  icon: LucideIcon;
  title: string;
  message: string;
  actionHref?: string;
  actionLabel?: string;
  tone?: 'neutral' | 'warning';
}

export function PortalNotice({ icon: Icon, title, message, actionHref, actionLabel, tone = 'neutral' }: PortalNoticeProps) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-bg p-6">
      <div className="w-full max-w-md rounded-3xl border border-line bg-white p-8 text-center shadow-[0_24px_60px_-30px_rgba(18,58,43,0.35)]">
        <span
          className={`mx-auto flex h-14 w-14 items-center justify-center rounded-2xl ${
            tone === 'warning' ? 'bg-saffron-soft text-saffron' : 'bg-sage text-forest'
          }`}
        >
          <Icon className="h-7 w-7" />
        </span>
        <h1 className="mt-5 font-display text-2xl font-semibold text-ink">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">{message}</p>
        {actionHref && actionLabel && (
          <Link
            href={actionHref}
            className="mt-6 inline-flex w-full items-center justify-center rounded-full bg-forest py-3 text-sm font-semibold text-white transition hover:bg-forest-deep"
          >
            {actionLabel}
          </Link>
        )}
        <Link href="/" className="mt-3 inline-block text-sm font-medium text-ink-muted hover:text-ink">
          Back to home
        </Link>
      </div>
    </div>
  );
}
