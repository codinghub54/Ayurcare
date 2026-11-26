'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import {
  ArrowRight,
  Wind,
  Flame,
  Leaf,
  MessageCircle,
  FileText,
  Video,
  ClipboardList,
  CalendarCheck,
  ShieldCheck,
  FolderHeart,
  Sprout,
  Stethoscope,
  Download,
  Lock,
  AlertTriangle,
  Menu,
  X,
  Check,
  ChevronDown,
  CalendarClock,
  Users,
  FileSignature,
  BadgeCheck,
  UserPlus,
} from 'lucide-react';
import ScrollReveal from '@/components/ui/ScrollReveal';
import Logo, { LogoMark } from '@/components/brand/Logo';
import HeroIllustration from '@/components/brand/HeroIllustration';

type DoshaKey = 'vata' | 'pitta' | 'kapha';

const DOSHAS: Record<
  DoshaKey,
  { name: string; icon: typeof Wind; elements: string; governs: string; color: string; soft: string; balanced: string[]; imbalanced: string[] }
> = {
  vata: {
    name: 'Vata',
    icon: Wind,
    elements: 'Air + Space',
    governs: 'Movement: breathing, circulation, the nervous system and the flow of thought.',
    color: '#5F86A0',
    soft: '#EAF1F5',
    balanced: ['Creative and quick to learn', 'Light, energetic and adaptable', 'Enthusiastic and expressive'],
    imbalanced: ['Dry skin, constipation, feeling cold', 'Anxiety and restlessness', 'Irregular sleep and appetite'],
  },
  pitta: {
    name: 'Pitta',
    icon: Flame,
    elements: 'Fire + Water',
    governs: 'Transformation: digestion, metabolism, body heat and how we process experiences.',
    color: '#C4622D',
    soft: '#FBEDE4',
    balanced: ['Sharp focus and clear thinking', 'Strong digestion and appetite', 'Natural drive and leadership'],
    imbalanced: ['Acidity, heartburn, skin rashes', 'Irritability and impatience', 'Excess heat and sweating'],
  },
  kapha: {
    name: 'Kapha',
    icon: Leaf,
    elements: 'Earth + Water',
    governs: 'Structure: strength, immunity, lubrication of joints and emotional steadiness.',
    color: '#4F7D52',
    soft: '#EAF2EA',
    balanced: ['Calm, patient and caring', 'Steady energy and stamina', 'Strong immunity'],
    imbalanced: ['Sluggishness and oversleeping', 'Congestion and weight gain', 'Resistance to change'],
  },
};

const NAV = [
  { label: 'How it works', href: '#how-it-works' },
  { label: 'Features', href: '#features' },
  { label: 'Doshas', href: '#doshas' },
  { label: 'For physicians', href: '#physicians' },
  { label: 'FAQ', href: '#faq' },
];

const FAQS = [
  {
    q: 'Who are the physicians on AyurCare?',
    a: 'Ayurvedic practitioners apply through our physician sign-up. They submit their qualification, medical registration number, credential documents and identity verification. Our team reviews each application, and only approved physicians appear in the doctor directory and can take consultations.',
  },
  {
    q: 'Does the AI assistant diagnose me?',
    a: 'No. PrakritiAI and the report analyser give general, educational guidance based on Ayurvedic principles. They are not a diagnosis or a prescription. For any treatment decision, please consult a physician.',
  },
  {
    q: 'Can I use AyurCare in an emergency?',
    a: 'No. AyurCare is not an emergency service. If you have chest pain, difficulty breathing, severe bleeding, sudden weakness or any other emergency, call 112 or go to the nearest hospital straight away.',
  },
  {
    q: 'How do payments work?',
    a: 'Each physician sets their own consultation fee, which you see before you book. Payments are processed by Stripe, so your card details are handled by Stripe and are not stored on AyurCare.',
  },
  {
    q: 'Can I get a copy of my data?',
    a: 'Yes. From your profile you can download a copy of the personal and health data stored in your AyurCare account.',
  },
];

export default function Home() {
  const { user, logout } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeDosha, setActiveDosha] = useState<DoshaKey>('vata');
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const dashboardHref =
    user?.role === 'ADMIN' ? '/admin/dashboard' : user?.role === 'DOCTOR' ? '/doctor/dashboard' : '/patient/dashboard';

  const dosha = DOSHAS[activeDosha];
  const DoshaIcon = dosha.icon;

  return (
    <div className="min-h-screen flex flex-col bg-bg text-ink" id="ayurcare-landing-page">
      {/* ─────────────── Header ─────────────── */}
      <header
        className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
          scrolled || menuOpen ? 'bg-bg/90 backdrop-blur-xl border-b border-line shadow-[0_1px_0_rgba(0,0,0,0.02)]' : 'bg-transparent'
        }`}
      >
        <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-5 md:px-8">
          <Logo />

          <nav className="hidden lg:flex items-center gap-8" aria-label="Main">
            {NAV.map((item) => (
              <a key={item.href} href={item.href} className="text-sm font-medium text-ink-muted transition hover:text-ink">
                {item.label}
              </a>
            ))}
          </nav>

          <div className="hidden lg:flex items-center gap-3">
            {user ? (
              <>
                <span className="text-sm text-ink-muted">Namaste, {user.name.split(' ')[0]}</span>
                <Link
                  href={dashboardHref}
                  className="rounded-full bg-forest px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-forest-deep"
                >
                  Go to dashboard
                </Link>
                <button onClick={logout} className="px-2 text-sm font-medium text-ink-muted hover:text-ink">
                  Sign out
                </button>
              </>
            ) : (
              <>
                <Link href="/patient/login" className="px-3 py-2 text-sm font-semibold text-ink hover:text-forest">
                  Sign in
                </Link>
                <Link
                  href="/patient/signup"
                  className="inline-flex items-center gap-2 rounded-full bg-forest px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-forest-deep"
                >
                  Get started <ArrowRight className="h-4 w-4" />
                </Link>
              </>
            )}
          </div>

          <button
            className="lg:hidden -mr-2 rounded-lg p-2 text-ink"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {menuOpen && (
          <div className="lg:hidden border-t border-line bg-bg px-5 pb-6 pt-2">
            <nav className="flex flex-col" aria-label="Mobile">
              {NAV.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  className="border-b border-line/70 py-3.5 text-base font-medium text-ink"
                >
                  {item.label}
                </a>
              ))}
            </nav>
            <div className="mt-5 grid grid-cols-2 gap-3">
              {user ? (
                <>
                  <Link href={dashboardHref} className="col-span-2 rounded-full bg-forest py-3 text-center text-sm font-semibold text-white">
                    Go to dashboard
                  </Link>
                  <button onClick={logout} className="col-span-2 rounded-full border border-line py-3 text-sm font-semibold text-ink">
                    Sign out
                  </button>
                </>
              ) : (
                <>
                  <Link href="/patient/login" className="rounded-full border border-line py-3 text-center text-sm font-semibold text-ink">
                    Sign in
                  </Link>
                  <Link href="/patient/signup" className="rounded-full bg-forest py-3 text-center text-sm font-semibold text-white">
                    Get started
                  </Link>
                </>
              )}
            </div>
          </div>
        )}
      </header>

      <main className="flex-1">
        {/* ─────────────── Hero ─────────────── */}
        <section className="relative overflow-hidden pt-[72px]">
          <div className="absolute inset-0 bg-dot-grid [mask-image:radial-gradient(ellipse_70%_60%_at_30%_40%,black,transparent)] pointer-events-none" />
          <div className="relative mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-5 pb-20 pt-12 md:px-8 lg:grid-cols-[1.1fr_0.9fr] lg:pb-28 lg:pt-20">
            <div>
              <div className="animate-slideUp" style={{ animationDelay: '0s' }}>
                <span className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-3.5 py-1.5 text-xs font-semibold text-forest shadow-sm">
                  <span className="h-1.5 w-1.5 rounded-full bg-saffron" />
                  Ayurvedic telehealth for India
                </span>
              </div>

              <div className="animate-slideUp" style={{ animationDelay: '0.08s' }}>
                <h1 className="mt-6 font-display text-[clamp(2.6rem,6vw,4.6rem)] font-semibold leading-[1.02] tracking-[-0.025em] text-ink">
                  Ayurvedic care that starts with{' '}
                  <span className="relative whitespace-nowrap text-forest">
                    <span className="italic">your</span> nature.
                    <svg className="absolute -bottom-2 left-0 h-3 w-full" viewBox="0 0 200 12" preserveAspectRatio="none" aria-hidden="true">
                      <path d="M2 9C50 3 150 3 198 8" stroke="#D4862A" strokeWidth="3" fill="none" strokeLinecap="round" />
                    </svg>
                  </span>
                </h1>
              </div>

              <div className="animate-slideUp" style={{ animationDelay: '0.16s' }}>
                <p className="mt-7 max-w-xl text-lg leading-relaxed text-ink-muted md:text-xl">
                  Discover your Prakriti, consult verified Ayurvedic physicians over video, and keep your
                  prescriptions and reports in one place. Built for everyday wellbeing, from home.
                </p>
              </div>

              <div className="animate-slideUp" style={{ animationDelay: '0.24s' }}>
                <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                  <Link
                    href={user ? dashboardHref : '/patient/signup'}
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-forest px-7 py-4 text-[15px] font-semibold text-white shadow-[0_10px_30px_-10px_rgba(30,90,67,0.6)] transition hover:bg-forest-deep"
                  >
                    {user ? 'Go to your dashboard' : 'Create your free account'}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  <a
                    href="#how-it-works"
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-line bg-white px-7 py-4 text-[15px] font-semibold text-ink transition hover:border-forest/40"
                  >
                    See how it works
                  </a>
                </div>
              </div>

              <div className="animate-slideUp" style={{ animationDelay: '0.32s' }}>
                <ul className="mt-10 grid gap-3 text-sm text-ink-muted sm:grid-cols-3 sm:gap-4">
                  {[
                    { icon: BadgeCheck, text: 'Physicians reviewed before they consult' },
                    { icon: FileSignature, text: 'Digital prescriptions after every visit' },
                    { icon: Download, text: 'Download your data any time' },
                  ].map(({ icon: Icon, text }) => (
                    <li key={text} className="flex items-start gap-2.5">
                      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-forest" />
                      <span>{text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="animate-slideUp relative mx-auto w-full max-w-[460px]" style={{ animationDelay: '0.1s' }}>
              <div className="absolute -inset-6 rounded-[48px] bg-saffron-soft/70 blur-2xl" aria-hidden="true" />
              <HeroIllustration className="relative w-full drop-shadow-[0_30px_50px_rgba(18,58,43,0.25)]" />

              <div className="absolute -left-4 top-[22%] hidden animate-float-slow items-center gap-3 rounded-2xl border border-line bg-white/95 px-4 py-3 shadow-lg backdrop-blur sm:flex">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sage text-forest">
                  <ClipboardList className="h-5 w-5" />
                </span>
                <span className="text-sm font-semibold leading-tight text-ink">
                  Prakriti quiz
                  <span className="block text-xs font-normal text-ink-muted">Find your dosha type</span>
                </span>
              </div>

              <div
                className="absolute -right-3 bottom-[18%] hidden animate-float-slow items-center gap-3 rounded-2xl border border-line bg-white/95 px-4 py-3 shadow-lg backdrop-blur sm:flex"
                style={{ animationDelay: '1.5s' }}
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-saffron-soft text-saffron">
                  <Video className="h-5 w-5" />
                </span>
                <span className="text-sm font-semibold leading-tight text-ink">
                  Video consultation
                  <span className="block text-xs font-normal text-ink-muted">With an Ayurvedic physician</span>
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* ─────────────── Feature strip ─────────────── */}
        <section className="border-y border-line bg-white">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-10 gap-y-4 px-5 py-6 md:px-8">
            {[
              { icon: Video, label: 'Video consultations' },
              { icon: ClipboardList, label: 'Prakriti assessment' },
              { icon: MessageCircle, label: 'AI wellness assistant' },
              { icon: FileText, label: 'Lab report analyser' },
              { icon: FolderHeart, label: 'Health records' },
              { icon: Sprout, label: 'Yoga, diet & herb guides' },
            ].map(({ icon: Icon, label }) => (
              <span key={label} className="inline-flex items-center gap-2 text-sm font-medium text-ink-muted">
                <Icon className="h-4 w-4 text-forest" />
                {label}
              </span>
            ))}
          </div>
        </section>

        {/* ─────────────── How it works ─────────────── */}
        <section id="how-it-works" className="px-5 py-24 md:px-8 md:py-32">
          <div className="mx-auto max-w-7xl">
            <div className="mx-auto max-w-2xl text-center">
              <ScrollReveal>
                <span className="eyebrow">How it works</span>
              </ScrollReveal>
              <ScrollReveal delay={0.08}>
                <h2 className="mt-4 font-display text-[clamp(2rem,4vw,3.2rem)] font-semibold leading-[1.08] tracking-[-0.02em]">
                  Understand the pattern, then treat the person.
                </h2>
              </ScrollReveal>
              <ScrollReveal delay={0.14}>
                <p className="mt-5 text-lg text-ink-muted">
                  Ayurveda looks at your constitution before your symptoms. AyurCare follows the same order.
                </p>
              </ScrollReveal>
            </div>

            <div className="relative mt-16 grid gap-6 md:grid-cols-3">
              <div className="absolute left-[16%] right-[16%] top-10 hidden h-px border-t border-dashed border-forest/30 md:block" aria-hidden="true" />
              {[
                {
                  icon: UserPlus,
                  title: 'Create your account and take the Prakriti quiz',
                  desc: 'Answer questions about your body, digestion, sleep and temperament to learn your dominant dosha. Your result is saved to your profile.',
                },
                {
                  icon: CalendarCheck,
                  title: 'Choose a physician and book a slot',
                  desc: 'Browse approved Ayurvedic physicians by specialisation, language and fee, then pick a time from their published availability.',
                },
                {
                  icon: Video,
                  title: 'Consult on video and get your prescription',
                  desc: 'Meet your physician in a private video room. Your prescription, notes and follow-up advice are saved to your records.',
                },
              ].map((step, i) => (
                <ScrollReveal key={step.title} delay={i * 0.1}>
                  <div className="relative h-full rounded-3xl border border-line bg-white p-8 transition hover:-translate-y-1 hover:shadow-[0_20px_40px_-24px_rgba(18,58,43,0.35)]">
                    <div className="flex items-center justify-between">
                      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-forest text-white">
                        <step.icon className="h-6 w-6" />
                      </span>
                      <span className="font-display text-5xl font-semibold text-line">0{i + 1}</span>
                    </div>
                    <h3 className="mt-7 text-xl font-semibold leading-snug">{step.title}</h3>
                    <p className="mt-3 leading-relaxed text-ink-muted">{step.desc}</p>
                  </div>
                </ScrollReveal>
              ))}
            </div>
          </div>
        </section>

        {/* ─────────────── Features (bento) ─────────────── */}
        <section id="features" className="bg-white px-5 py-24 md:px-8 md:py-32">
          <div className="mx-auto max-w-7xl">
            <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
              <div className="max-w-2xl">
                <ScrollReveal>
                  <span className="eyebrow">For patients</span>
                </ScrollReveal>
                <ScrollReveal delay={0.08}>
                  <h2 className="mt-4 font-display text-[clamp(2rem,4vw,3.2rem)] font-semibold leading-[1.08] tracking-[-0.02em]">
                    Everything for your care, in one place.
                  </h2>
                </ScrollReveal>
              </div>
              <ScrollReveal delay={0.12}>
                <Link href={user ? dashboardHref : '/patient/signup'} className="inline-flex items-center gap-2 font-semibold text-forest hover:gap-3 transition-all">
                  {user ? 'Open your dashboard' : 'Start for free'} <ArrowRight className="h-4 w-4" />
                </Link>
              </ScrollReveal>
            </div>

            <div className="mt-14 grid gap-5 md:grid-cols-6">
              {/* Large card: consultations */}
              <ScrollReveal className="md:col-span-4">
                <div className="relative h-full overflow-hidden rounded-3xl bg-forest p-8 text-white md:p-10 bg-leaf-pattern">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
                    <Stethoscope className="h-6 w-6 text-gold-300" />
                  </span>
                  <h3 className="mt-6 max-w-md font-display text-3xl font-semibold leading-tight">Consult a verified Ayurvedic physician</h3>
                  <p className="mt-4 max-w-lg text-white/75 leading-relaxed">
                    Book a video consultation at a time that suits you. Your physician reviews your health history before
                    the call, writes your prescription digitally, and can schedule a follow-up.
                  </p>
                  <ul className="mt-7 grid gap-3 text-sm text-white/85 sm:grid-cols-2">
                    {['Filter by specialisation and language', 'See the fee before you book', 'Private in-browser video room', 'Prescription saved to your records'].map((t) => (
                      <li key={t} className="flex items-center gap-2.5">
                        <Check className="h-4 w-4 shrink-0 text-gold-300" /> {t}
                      </li>
                    ))}
                  </ul>
                </div>
              </ScrollReveal>

              {/* Prakriti */}
              <ScrollReveal className="md:col-span-2" delay={0.08}>
                <div className="flex h-full flex-col rounded-3xl border border-line bg-bg p-8">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-saffron-soft text-saffron">
                    <ClipboardList className="h-6 w-6" />
                  </span>
                  <h3 className="mt-6 text-xl font-semibold">Prakriti assessment</h3>
                  <p className="mt-3 leading-relaxed text-ink-muted">
                    A guided questionnaire that identifies your dominant dosha and tailors the diet, herb and yoga
                    suggestions you see.
                  </p>
                  <div className="mt-auto flex gap-2 pt-6" aria-hidden="true">
                    {(['vata', 'pitta', 'kapha'] as DoshaKey[]).map((k) => (
                      <span key={k} className="rounded-full px-3 py-1 text-xs font-semibold" style={{ background: DOSHAS[k].soft, color: DOSHAS[k].color }}>
                        {DOSHAS[k].name}
                      </span>
                    ))}
                  </div>
                </div>
              </ScrollReveal>

              {[
                {
                  icon: MessageCircle,
                  title: 'PrakritiAI assistant',
                  desc: 'Ask everyday wellness questions and get answers grounded in Ayurvedic principles, with clear prompts to see a doctor when something sounds serious.',
                  tint: 'bg-sage text-forest',
                },
                {
                  icon: FileText,
                  title: 'Lab report analyser',
                  desc: 'Upload a blood test or report as a PDF or photo. The text is extracted and explained in plain language, alongside an Ayurvedic perspective.',
                  tint: 'bg-saffron-soft text-saffron',
                },
                {
                  icon: FolderHeart,
                  title: 'Health records',
                  desc: 'Keep reports, prescriptions and consultation notes together, so you and your physician always have the full picture.',
                  tint: 'bg-sage text-forest',
                },
              ].map((f, i) => (
                <ScrollReveal key={f.title} className="md:col-span-2" delay={i * 0.08}>
                  <div className="h-full rounded-3xl border border-line bg-white p-8 transition hover:border-forest/30">
                    <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${f.tint}`}>
                      <f.icon className="h-6 w-6" />
                    </span>
                    <h3 className="mt-6 text-xl font-semibold">{f.title}</h3>
                    <p className="mt-3 leading-relaxed text-ink-muted">{f.desc}</p>
                  </div>
                </ScrollReveal>
              ))}

              {/* Wellness library */}
              <ScrollReveal className="md:col-span-6">
                <div className="grid items-center gap-8 rounded-3xl border border-line bg-gradient-to-br from-saffron-soft via-bg to-sage p-8 md:grid-cols-[1fr_1.2fr] md:p-10">
                  <div>
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-forest shadow-sm">
                      <Sprout className="h-6 w-6" />
                    </span>
                    <h3 className="mt-6 font-display text-2xl font-semibold md:text-3xl">A daily wellness library</h3>
                    <p className="mt-3 max-w-md leading-relaxed text-ink-muted">
                      Practical guides you can use between consultations, filtered by your dosha where it matters.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {['Yoga guide', 'Guided meditation', 'Pranayama breathing', 'Ayurvedic diet plans', 'Herb directory', 'Kitchen home remedies'].map((t) => (
                      <span key={t} className="rounded-2xl border border-white bg-white/80 px-4 py-3.5 text-sm font-semibold text-ink shadow-sm">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              </ScrollReveal>
            </div>
          </div>
        </section>

        {/* ─────────────── Doshas ─────────────── */}
        <section id="doshas" className="px-5 py-24 md:px-8 md:py-32">
          <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
            <div>
              <ScrollReveal>
                <span className="eyebrow">The three doshas</span>
              </ScrollReveal>
              <ScrollReveal delay={0.08}>
                <h2 className="mt-4 font-display text-[clamp(2rem,4vw,3.2rem)] font-semibold leading-[1.08] tracking-[-0.02em]">
                  Every body has its own balance.
                </h2>
              </ScrollReveal>
              <ScrollReveal delay={0.14}>
                <p className="mt-5 text-lg leading-relaxed text-ink-muted">
                  In Ayurveda, Vata, Pitta and Kapha are the three functional energies that shape how your body and
                  mind work. Everyone has all three, in a proportion that is unique to them: your Prakriti.
                </p>
              </ScrollReveal>

              <div className="mt-10 flex flex-col gap-3" role="tablist" aria-label="Doshas">
                {(Object.keys(DOSHAS) as DoshaKey[]).map((key) => {
                  const d = DOSHAS[key];
                  const Icon = d.icon;
                  const active = key === activeDosha;
                  return (
                    <button
                      key={key}
                      role="tab"
                      aria-selected={active}
                      onClick={() => setActiveDosha(key)}
                      className={`flex items-center gap-4 rounded-2xl border px-5 py-4 text-left transition ${
                        active ? 'border-transparent bg-white shadow-[0_12px_30px_-18px_rgba(18,58,43,0.45)]' : 'border-line hover:bg-white/60'
                      }`}
                    >
                      <span className="flex h-11 w-11 items-center justify-center rounded-xl" style={{ background: d.soft, color: d.color }}>
                        <Icon className="h-5 w-5" />
                      </span>
                      <span className="flex-1">
                        <span className="block font-semibold">{d.name}</span>
                        <span className="block text-sm text-ink-muted">{d.elements}</span>
                      </span>
                      <ArrowRight className={`h-4 w-4 transition ${active ? 'translate-x-0 opacity-100' : '-translate-x-1 opacity-0'}`} style={{ color: d.color }} />
                    </button>
                  );
                })}
              </div>
            </div>

            <div key={activeDosha} className="animate-slideUp rounded-[32px] p-8 md:p-12" style={{ background: dosha.soft }}>
              <div className="flex items-center gap-4">
                <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white" style={{ color: dosha.color }}>
                  <DoshaIcon className="h-8 w-8" />
                </span>
                <div>
                  <h3 className="font-display text-4xl font-semibold" style={{ color: dosha.color }}>
                    {dosha.name}
                  </h3>
                  <p className="text-sm font-semibold uppercase tracking-[0.14em] text-ink-muted">{dosha.elements}</p>
                </div>
              </div>
              <p className="mt-8 text-lg leading-relaxed text-ink">{dosha.governs}</p>

              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl bg-white p-6">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-forest">When in balance</p>
                  <ul className="mt-4 space-y-3">
                    {dosha.balanced.map((t) => (
                      <li key={t} className="flex gap-2.5 text-sm text-ink">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-forest" /> {t}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-2xl bg-white p-6">
                  <p className="text-xs font-bold uppercase tracking-[0.14em]" style={{ color: dosha.color }}>
                    When out of balance
                  </p>
                  <ul className="mt-4 space-y-3">
                    {dosha.imbalanced.map((t) => (
                      <li key={t} className="flex gap-2.5 text-sm text-ink">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: dosha.color }} /> {t}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <Link
                href={user ? '/patient/quiz' : '/patient/signup'}
                className="mt-8 inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-forest-deep"
              >
                Find out your Prakriti <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>

        {/* ─────────────── For physicians ─────────────── */}
        <section id="physicians" className="px-5 pb-24 md:px-8 md:pb-32">
          <div className="mx-auto max-w-7xl overflow-hidden rounded-[36px] bg-forest-deep text-white bg-leaf-pattern">
            <div className="grid gap-12 p-8 md:p-14 lg:grid-cols-2 lg:gap-16 lg:p-16">
              <div>
                <ScrollReveal>
                  <span className="eyebrow !text-gold-300">For Ayurvedic physicians</span>
                </ScrollReveal>
                <ScrollReveal delay={0.08}>
                  <h2 className="mt-4 font-display text-[clamp(2rem,4vw,3rem)] font-semibold leading-[1.08] tracking-[-0.02em]">
                    Run your online practice from one workspace.
                  </h2>
                </ScrollReveal>
                <ScrollReveal delay={0.14}>
                  <p className="mt-5 max-w-lg text-lg leading-relaxed text-white/70">
                    Publish your availability, see each patient&apos;s history before the call, and write prescriptions
                    without paperwork.
                  </p>
                </ScrollReveal>

                <div className="mt-10 grid gap-4 sm:grid-cols-2">
                  {[
                    { icon: CalendarClock, title: 'Availability slots', desc: 'Set the times patients can book.' },
                    { icon: Users, title: 'Patient directory', desc: 'History, Prakriti and records together.' },
                    { icon: FileSignature, title: 'E-prescription builder', desc: 'Medicines, dosage and advice in one form.' },
                    { icon: Video, title: 'Built-in video room', desc: 'No extra software to install.' },
                  ].map((f) => (
                    <div key={f.title} className="rounded-2xl border border-white/10 bg-white/5 p-5">
                      <f.icon className="h-5 w-5 text-gold-300" />
                      <p className="mt-3 font-semibold">{f.title}</p>
                      <p className="mt-1 text-sm text-white/60">{f.desc}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-col justify-center rounded-3xl bg-white p-8 text-ink md:p-10">
                <p className="text-sm font-bold uppercase tracking-[0.14em] text-forest">How verification works</p>
                <ol className="mt-6 space-y-6">
                  {[
                    { title: 'Apply online', desc: 'Share your qualification, registration number, specialisations and consultation fee.' },
                    { title: 'Submit documents', desc: 'Upload your licence or degree and complete identity verification.' },
                    { title: 'Team review', desc: 'Our team checks your application. You can sign in to see its status at any time.' },
                    { title: 'Start consulting', desc: 'Once approved, your profile is listed and patients can book you.' },
                  ].map((s, i) => (
                    <li key={s.title} className="flex gap-4">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sage text-sm font-bold text-forest">{i + 1}</span>
                      <div>
                        <p className="font-semibold">{s.title}</p>
                        <p className="mt-1 text-sm leading-relaxed text-ink-muted">{s.desc}</p>
                      </div>
                    </li>
                  ))}
                </ol>
                <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                  <Link href="/doctor/signup" className="inline-flex items-center justify-center gap-2 rounded-full bg-forest px-6 py-3.5 text-sm font-semibold text-white hover:bg-forest-deep">
                    Apply as a physician <ArrowRight className="h-4 w-4" />
                  </Link>
                  <Link href="/doctor/login" className="inline-flex items-center justify-center rounded-full border border-line px-6 py-3.5 text-sm font-semibold text-ink hover:border-forest/40">
                    Physician sign in
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ─────────────── Safety & privacy ─────────────── */}
        <section className="bg-white px-5 py-24 md:px-8 md:py-28">
          <div className="mx-auto max-w-7xl">
            <div className="max-w-2xl">
              <ScrollReveal>
                <span className="eyebrow">Safety & privacy</span>
              </ScrollReveal>
              <ScrollReveal delay={0.08}>
                <h2 className="mt-4 font-display text-[clamp(2rem,4vw,3.2rem)] font-semibold leading-[1.08] tracking-[-0.02em]">
                  Traditional medicine, handled responsibly.
                </h2>
              </ScrollReveal>
            </div>
            <div className="mt-14 grid gap-5 md:grid-cols-3">
              {[
                {
                  icon: AlertTriangle,
                  title: 'AI that knows its limits',
                  desc: 'AI features are for general guidance only. They flag warning signs and point you to a physician instead of guessing.',
                },
                {
                  icon: Lock,
                  title: 'Protected accounts',
                  desc: 'Email verification on sign-up, hashed passwords, secure session cookies, and an emailed one-time code for administrator sign-in.',
                },
                {
                  icon: ShieldCheck,
                  title: 'Your data, your copy',
                  desc: 'Download the data held in your account from your profile whenever you want it.',
                },
              ].map((f, i) => (
                <ScrollReveal key={f.title} delay={i * 0.08}>
                  <div className="h-full rounded-3xl border border-line bg-bg p-8">
                    <f.icon className="h-6 w-6 text-forest" />
                    <h3 className="mt-5 text-lg font-semibold">{f.title}</h3>
                    <p className="mt-2 leading-relaxed text-ink-muted">{f.desc}</p>
                  </div>
                </ScrollReveal>
              ))}
            </div>
          </div>
        </section>

        {/* ─────────────── FAQ ─────────────── */}
        <section id="faq" className="px-5 py-24 md:px-8 md:py-32">
          <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <span className="eyebrow">FAQ</span>
              <h2 className="mt-4 font-display text-[clamp(2rem,4vw,3rem)] font-semibold leading-[1.08] tracking-[-0.02em]">
                Questions, answered.
              </h2>
              <p className="mt-5 text-lg text-ink-muted">What to know before your first consultation.</p>
            </div>
            <div className="divide-y divide-line rounded-3xl border border-line bg-white">
              {FAQS.map((f, i) => {
                const open = openFaq === i;
                return (
                  <div key={f.q}>
                    <button
                      className="flex w-full items-center justify-between gap-6 px-6 py-5 text-left md:px-8"
                      onClick={() => setOpenFaq(open ? null : i)}
                      aria-expanded={open}
                    >
                      <span className="font-semibold">{f.q}</span>
                      <ChevronDown className={`h-5 w-5 shrink-0 text-ink-muted transition ${open ? 'rotate-180' : ''}`} />
                    </button>
                    {open && <p className="animate-fadeIn px-6 pb-6 leading-relaxed text-ink-muted md:px-8">{f.a}</p>}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ─────────────── Final CTA ─────────────── */}
        <section className="px-5 pb-24 md:px-8">
          <div className="relative mx-auto max-w-7xl overflow-hidden rounded-[36px] bg-saffron-soft px-8 py-16 text-center md:py-20">
            <div className="absolute -left-20 -top-20 h-64 w-64 rounded-full bg-saffron/15 blur-3xl" aria-hidden="true" />
            <div className="absolute -bottom-24 -right-16 h-72 w-72 rounded-full bg-forest/10 blur-3xl" aria-hidden="true" />
            <LogoMark className="relative mx-auto h-12 w-12" />
            <h2 className="relative mx-auto mt-6 max-w-3xl font-display text-[clamp(2rem,4.5vw,3.4rem)] font-semibold leading-[1.08] tracking-[-0.02em]">
              Begin with your Prakriti. Continue with a physician who understands it.
            </h2>
            <div className="relative mt-9 flex flex-col justify-center gap-3 sm:flex-row">
              <Link
                href={user ? dashboardHref : '/patient/signup'}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-forest px-7 py-4 text-[15px] font-semibold text-white hover:bg-forest-deep"
              >
                {user ? 'Go to your dashboard' : 'Create your free account'} <ArrowRight className="h-4 w-4" />
              </Link>
              {!user && (
                <Link href="/patient/login" className="inline-flex items-center justify-center rounded-full border border-ink/15 bg-white px-7 py-4 text-[15px] font-semibold text-ink">
                  I already have an account
                </Link>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* ─────────────── Footer ─────────────── */}
      <footer className="border-t border-line bg-white px-5 pt-16 pb-10 md:px-8">
        <div className="mx-auto grid max-w-7xl gap-10 md:grid-cols-[1.4fr_1fr_1fr_1.4fr]">
          <div>
            <Logo />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-ink-muted">
              Online Ayurvedic consultations, Prakriti assessment and wellness tools in one platform.
            </p>
          </div>
          <div>
            <p className="text-sm font-semibold">Patients</p>
            <ul className="mt-4 space-y-3 text-sm text-ink-muted">
              <li><Link href="/patient/signup" className="hover:text-forest">Create account</Link></li>
              <li><Link href="/patient/login" className="hover:text-forest">Sign in</Link></li>
              <li><a href="#how-it-works" className="hover:text-forest">How it works</a></li>
            </ul>
          </div>
          <div>
            <p className="text-sm font-semibold">Physicians</p>
            <ul className="mt-4 space-y-3 text-sm text-ink-muted">
              <li><Link href="/doctor/signup" className="hover:text-forest">Apply to join</Link></li>
              <li><Link href="/doctor/login" className="hover:text-forest">Physician sign in</Link></li>
              <li><a href="#physicians" className="hover:text-forest">Verification process</a></li>
            </ul>
          </div>
          <div className="rounded-2xl bg-bg p-5">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <AlertTriangle className="h-4 w-4 text-saffron" /> Medical disclaimer
            </p>
            <p className="mt-2 text-xs leading-relaxed text-ink-muted">
              Information and AI responses on AyurCare are for general wellness education and are not a substitute for
              professional medical advice, diagnosis or treatment. In an emergency, call 112.
            </p>
          </div>
        </div>
        <div className="mx-auto mt-12 flex max-w-7xl flex-col items-center justify-between gap-3 border-t border-line pt-8 text-xs text-ink-muted md:flex-row">
          <span>&copy; {new Date().getFullYear()} AyurCare. All rights reserved.</span>
        </div>
      </footer>
    </div>
  );
}
