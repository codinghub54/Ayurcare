import React from 'react';
import Link from 'next/link';
import { Check } from 'lucide-react';
import Logo from '@/components/brand/Logo';
import HeroIllustration from '@/components/brand/HeroIllustration';

interface AuthShellProps {
  /** Short line above the panel headline, e.g. "Patient portal" */
  eyebrow: string;
  headline: string;
  points: string[];
  children: React.ReactNode;
  /** Wider form column for long forms such as physician sign-up */
  wide?: boolean;
}

/** Split-screen layout shared by every sign-in and sign-up screen. */
export default function AuthShell({ eyebrow, headline, points, children, wide = false }: AuthShellProps) {
  return (
    <main className="min-h-screen bg-bg lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      {/* Brand panel */}
      <section className="relative hidden lg:flex lg:sticky lg:top-0 lg:h-screen flex-col justify-between overflow-hidden bg-forest-deep p-12 text-white bg-leaf-pattern xl:p-14">
        <Logo tone="light" />

        <div className="relative z-10 max-w-md">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-gold-300">{eyebrow}</p>
          <h1 className="mt-4 font-display text-4xl font-semibold leading-[1.1] xl:text-[2.75rem]">{headline}</h1>
          <ul className="mt-8 space-y-3.5">
            {points.map((p) => (
              <li key={p} className="flex items-start gap-3 text-white/80">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/10">
                  <Check className="h-3 w-3 text-gold-300" />
                </span>
                <span className="text-[15px] leading-relaxed">{p}</span>
              </li>
            ))}
          </ul>
        </div>

        <HeroIllustration className="pointer-events-none absolute -bottom-24 -right-20 w-[340px] opacity-25" />

        <p className="relative z-10 text-xs text-white/45">
          For general wellness guidance. In an emergency, call 112.
        </p>
      </section>

      {/* Form column */}
      <section className="flex min-h-screen flex-col px-5 py-6 sm:px-8 lg:min-h-0 lg:py-10">
        <div className="flex items-center justify-between lg:justify-end">
          <span className="lg:hidden">
            <Logo />
          </span>
          <Link href="/" className="text-sm font-medium text-ink-muted hover:text-ink">
            ← Back to home
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-center py-10">
          <div className={`w-full ${wide ? 'max-w-2xl' : 'max-w-[420px]'}`}>{children}</div>
        </div>
      </section>
    </main>
  );
}

/** Shared input styling for auth forms. */
export const authInput =
  'w-full rounded-xl border border-line bg-white px-4 py-3 text-[15px] text-ink placeholder:text-ink-muted/60 transition focus:border-forest focus:outline-none focus:ring-4 focus:ring-forest/10';

export const authLabel = 'mb-1.5 block text-sm font-semibold text-ink';

export const authPrimaryButton =
  'flex w-full items-center justify-center gap-2 rounded-xl bg-forest py-3.5 text-[15px] font-semibold text-white transition hover:bg-forest-deep disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer';
