import Link from 'next/link';

interface LogoProps {
  href?: string | null;
  tone?: 'dark' | 'light';
  className?: string;
  subtitle?: string;
}

/** AyurCare mark: a leaf held inside a drop, drawn as one shape. */
export function LogoMark({ className = 'w-8 h-8', tone = 'dark' }: { className?: string; tone?: 'dark' | 'light' }) {
  const fill = tone === 'dark' ? '#1E5A43' : '#FFFFFF';
  const vein = tone === 'dark' ? '#FBF8F2' : '#1E5A43';
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <path
        d="M16 2.5C16 2.5 5.5 12.2 5.5 19.2C5.5 25 10.2 29.5 16 29.5C21.8 29.5 26.5 25 26.5 19.2C26.5 12.2 16 2.5 16 2.5Z"
        fill={fill}
      />
      <path d="M16 27V12.5" stroke={vein} strokeWidth="1.6" strokeLinecap="round" />
      <path d="M16 18.5L11.5 15M16 22.5L20.5 19" stroke={vein} strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="22.6" cy="9.4" r="2.4" fill="#D4862A" />
    </svg>
  );
}

export default function Logo({ href = '/', tone = 'dark', className = '', subtitle }: LogoProps) {
  const content = (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark tone={tone} />
      <span className="flex flex-col leading-none">
        <span
          className={`font-display text-[1.35rem] font-semibold tracking-tight ${tone === 'dark' ? 'text-ink' : 'text-white'}`}
        >
          AyurCare
        </span>
        {subtitle && (
          <span
            className={`mt-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${
              tone === 'dark' ? 'text-ink-muted' : 'text-white/60'
            }`}
          >
            {subtitle}
          </span>
        )}
      </span>
    </span>
  );

  if (!href) return content;
  return (
    <Link href={href} aria-label="AyurCare home" className="inline-flex">
      {content}
    </Link>
  );
}
