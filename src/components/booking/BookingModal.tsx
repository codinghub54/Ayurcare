'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { loadStripe, type Stripe, type StripeElements } from '@stripe/stripe-js';
import { X, Loader2, ShieldCheck, CheckCircle2, AlertCircle, Video, Phone, MessageSquare, Lock, ArrowLeft } from 'lucide-react';

type ConsultType = 'VIDEO' | 'AUDIO' | 'CHAT';

export interface BookableDoctor {
  id: string;
  name: string;
  doctorProfile?: { feePerConsult?: number; qualification?: string; specializations?: string } | null;
}

interface Props {
  doctor: BookableDoctor;
  initialType?: ConsultType;
  initialDate?: string;
  initialTime?: string;
  onClose: () => void;
}

const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
let stripePromise: Promise<Stripe | null> | null = null;
function getStripe() {
  if (!publishableKey) return null;
  if (!stripePromise) stripePromise = loadStripe(publishableKey);
  return stripePromise;
}

const TYPES: { value: ConsultType; label: string; icon: typeof Video }[] = [
  { value: 'VIDEO', label: 'Video', icon: Video },
  { value: 'AUDIO', label: 'Audio', icon: Phone },
  { value: 'CHAT', label: 'Chat', icon: MessageSquare },
];

/** Today + next 3 days, as IST calendar dates. */
function istDates() {
  return Array.from({ length: 4 }).map((_, i) => {
    const d = new Date(Date.now() + i * 24 * 60 * 60 * 1000);
    const iso = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const label =
      i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'Asia/Kolkata' });
    const day = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
    return { iso, label, day };
  });
}

function rupees(n: number) {
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function formatTime(t: string) {
  const [h, m] = t.split(':').map(Number);
  const d = new Date(2000, 0, 1, h, m);
  return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

export default function BookingModal({ doctor, initialType, initialDate, initialTime, onClose }: Props) {
  const dates = useMemo(() => istDates(), []);
  const fee = doctor.doctorProfile?.feePerConsult;

  const [step, setStep] = useState<'details' | 'pay' | 'done'>('details');
  const [type, setType] = useState<ConsultType>(initialType || 'VIDEO');
  const [date, setDate] = useState(initialDate && dates.some((d) => d.iso === initialDate) ? initialDate : dates[0].iso);
  const [slots, setSlots] = useState<string[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(true);
  const [time, setTime] = useState<string>('');
  const wantedTime = useRef<string | undefined>(initialTime);
  const [coupon, setCoupon] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [quote, setQuote] = useState<{ fee: number; discount: number; total: number } | null>(null);
  const [doneState, setDoneState] = useState<'confirmed' | 'processing'>('confirmed');

  const appointmentId = useRef<string | null>(null);
  const stripeRef = useRef<Stripe | null>(null);
  const elementsRef = useRef<StripeElements | null>(null);
  const paymentMountRef = useRef<HTMLDivElement>(null);
  const [cardReady, setCardReady] = useState(false);

  // Load open slots for the chosen date
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setSlotsLoading(true);
      setError('');
      try {
        const res = await fetch(`/api/patient/doctors/${encodeURIComponent(doctor.id)}/slots?date=${date}`);
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        const open: string[] = res.ok && Array.isArray(data.openSlots) ? data.openSlots : [];
        setSlots(open);
        if (!res.ok) setError(data.error || 'Could not load available times.');
        const wanted = wantedTime.current;
        wantedTime.current = undefined;
        setTime(wanted && open.includes(wanted) ? wanted : open[0] || '');
      } catch {
        if (!cancelled) setError('Could not load available times.');
      } finally {
        if (!cancelled) setSlotsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [date, doctor.id]);

  /** Leave the payment step: release the held slot and return to the details step. */
  const backToDetails = () => {
    if (appointmentId.current) {
      fetch('/api/patient/checkout/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentId: appointmentId.current }),
      }).catch(() => {});
      appointmentId.current = null;
    }
    elementsRef.current = null;
    setError('');
    setStep('details');
  };

  const close = async () => {
    // Release the reserved slot if the patient leaves before paying
    if (step === 'pay' && appointmentId.current) {
      fetch('/api/patient/checkout/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentId: appointmentId.current }),
      }).catch(() => {});
    }
    onClose();
  };

  const confirmWithServer = async (): Promise<'confirmed' | 'processing' | 'failed'> => {
    for (let attempt = 0; attempt < 5; attempt++) {
      const res = await fetch('/api/patient/checkout/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentId: appointmentId.current }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.status === 'confirmed') return 'confirmed';
      if (data.status === 'processing') {
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }
      if (!res.ok) setError(data.error || 'Could not confirm the payment.');
      return 'failed';
    }
    return 'processing';
  };

  const startCheckout = async () => {
    setError('');
    if (!time) {
      setError('Please choose a time.');
      return;
    }
    if (!publishableKey) {
      setError('Online payments are not set up yet. Please try again later.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/patient/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doctorId: doctor.id,
          type,
          scheduledAt: `${date}T${time}:00+05:30`,
          couponCode: coupon.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Could not start checkout.');
        return;
      }
      appointmentId.current = data.appointmentId;
      setQuote({ fee: data.fee, discount: data.discount, total: data.total });

      if (data.free) {
        setDoneState('confirmed');
        setStep('done');
        return;
      }

      const stripe = await getStripe();
      if (!stripe) {
        setError('Could not load the payment form. Please refresh and try again.');
        return;
      }
      stripeRef.current = stripe;
      elementsRef.current = stripe.elements({
        clientSecret: data.clientSecret,
        appearance: {
          theme: 'stripe',
          variables: {
            colorPrimary: '#1E5A43',
            colorText: '#16261E',
            borderRadius: '12px',
            fontFamily: 'Inter, system-ui, sans-serif',
          },
        },
      });
      setCardReady(false);
      setStep('pay');
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  // Mount Stripe's Payment Element once the pay step is on screen
  useEffect(() => {
    if (step !== 'pay' || !elementsRef.current || !paymentMountRef.current) return;
    const el = elementsRef.current.create('payment', { layout: 'tabs' });
    el.on('ready', () => setCardReady(true));
    el.mount(paymentMountRef.current);
    return () => el.destroy();
  }, [step]);

  const pay = async () => {
    if (!stripeRef.current || !elementsRef.current) return;
    setError('');
    setBusy(true);
    try {
      const returnUrl = `${window.location.origin}/patient/doctors?checkout=${appointmentId.current}`;
      const { error: stripeError } = await stripeRef.current.confirmPayment({
        elements: elementsRef.current,
        confirmParams: { return_url: returnUrl },
        redirect: 'if_required',
      });
      if (stripeError) {
        setError(stripeError.message || 'Your payment could not be completed.');
        return;
      }
      const result = await confirmWithServer();
      if (result === 'failed') return;
      setDoneState(result);
      setStep('done');
    } finally {
      setBusy(false);
    }
  };

  const selectedDate = dates.find((d) => d.iso === date);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={`Book ${doctor.name}`}>
      <div className="relative max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white shadow-2xl animate-slideUp sm:rounded-3xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-line bg-white/95 px-6 py-5 backdrop-blur">
          <div className="flex items-center gap-3">
            {step === 'pay' && (
              <button onClick={backToDetails} disabled={busy} className="-ml-2 rounded-full p-1.5 text-ink-muted hover:bg-bg hover:text-ink cursor-pointer" aria-label="Back to details">
                <ArrowLeft className="h-5 w-5" />
              </button>
            )}
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-forest">
                {step === 'details' ? 'Book a consultation' : step === 'pay' ? 'Secure payment' : 'Booking'}
              </p>
              <h3 className="mt-0.5 font-display text-xl font-semibold text-ink">{doctor.name}</h3>
              {doctor.doctorProfile?.qualification && <p className="text-xs text-ink-muted">{doctor.doctorProfile.qualification}</p>}
            </div>
          </div>
          <button onClick={step === 'done' ? onClose : close} className="rounded-full p-1.5 text-ink-muted hover:bg-bg hover:text-ink cursor-pointer" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-5">
          {error && (
            <div role="alert" className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> <span>{error}</span>
            </div>
          )}

          {step === 'details' && (
            <div className="space-y-6">
              <div>
                <p className="mb-2 text-sm font-semibold text-ink">Consultation type</p>
                <div className="grid grid-cols-3 gap-2">
                  {TYPES.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setType(t.value)}
                      className={`flex flex-col items-center gap-1 rounded-2xl border py-3 text-sm font-medium transition cursor-pointer ${
                        type === t.value ? 'border-forest bg-sage text-forest' : 'border-line text-ink-muted hover:border-forest/40'
                      }`}
                    >
                      <t.icon className="h-4 w-4" /> {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-2 text-sm font-semibold text-ink">Date</p>
                <div className="grid grid-cols-4 gap-2">
                  {dates.map((d) => (
                    <button
                      key={d.iso}
                      type="button"
                      onClick={() => setDate(d.iso)}
                      className={`rounded-2xl border px-1 py-2.5 text-center transition cursor-pointer ${
                        date === d.iso ? 'border-forest bg-sage text-forest' : 'border-line text-ink-muted hover:border-forest/40'
                      }`}
                    >
                      <span className="block text-xs font-semibold">{d.label}</span>
                      <span className="block text-[11px]">{d.day}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-2 flex items-center justify-between text-sm font-semibold text-ink">
                  Time <span className="text-xs font-normal text-ink-muted">Indian Standard Time</span>
                </p>
                {slotsLoading ? (
                  <div className="flex items-center justify-center gap-2 rounded-2xl border border-line py-6 text-sm text-ink-muted">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading times…
                  </div>
                ) : slots.length === 0 ? (
                  <p className="rounded-2xl border border-line bg-bg p-4 text-center text-sm text-ink-muted">
                    No open times on this day. Please pick another date.
                  </p>
                ) : (
                  <div className="grid max-h-40 grid-cols-4 gap-2 overflow-y-auto">
                    {slots.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setTime(s)}
                        className={`rounded-xl border py-2 text-sm transition cursor-pointer ${
                          time === s ? 'border-forest bg-forest text-white' : 'border-line text-ink hover:border-forest/40'
                        }`}
                      >
                        {formatTime(s)}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label htmlFor="coupon" className="mb-2 block text-sm font-semibold text-ink">
                  Coupon code <span className="font-normal text-ink-muted">(optional)</span>
                </label>
                <input
                  id="coupon"
                  value={coupon}
                  onChange={(e) => setCoupon(e.target.value.toUpperCase())}
                  className="w-full rounded-xl border border-line px-4 py-2.5 text-sm uppercase tracking-wide text-ink focus:border-forest focus:outline-none focus:ring-4 focus:ring-forest/10"
                />
              </div>

              <div className="flex items-center justify-between rounded-2xl bg-bg px-4 py-3">
                <span className="text-sm text-ink-muted">
                  {selectedDate?.label}, {selectedDate?.day}
                  {time ? ` · ${formatTime(time)}` : ''}
                </span>
                <span className="font-semibold text-ink">{fee != null ? rupees(fee) : ''}</span>
              </div>

              <button
                type="button"
                onClick={startCheckout}
                disabled={busy || slotsLoading || !time}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-forest py-3.5 text-[15px] font-semibold text-white transition hover:bg-forest-deep disabled:opacity-50 cursor-pointer"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                Continue to payment
              </button>
              <p className="text-center text-xs text-ink-muted">Your slot is held for 30 minutes while you pay.</p>
            </div>
          )}

          {step === 'pay' && quote && (
            <div className="space-y-5">
              <div className="space-y-1.5 rounded-2xl bg-bg px-4 py-3 text-sm">
                <div className="flex justify-between text-ink-muted">
                  <span>
                    {TYPES.find((t) => t.value === type)?.label} consultation · {selectedDate?.day}, {formatTime(time)} IST
                  </span>
                  <span>{rupees(quote.fee)}</span>
                </div>
                {quote.discount > 0 && (
                  <div className="flex justify-between text-forest">
                    <span>Coupon {coupon}</span>
                    <span>−{rupees(quote.discount)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-line pt-1.5 font-semibold text-ink">
                  <span>Total</span>
                  <span>{rupees(quote.total)}</span>
                </div>
              </div>

              {!cardReady && (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-ink-muted">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading secure payment form…
                </div>
              )}
              {/* Stripe mounts its iframe here; React must not render children inside it */}
              <div ref={paymentMountRef} />

              <button
                type="button"
                onClick={pay}
                disabled={busy || !cardReady}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-forest py-3.5 text-[15px] font-semibold text-white transition hover:bg-forest-deep disabled:opacity-50 cursor-pointer"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                Pay {rupees(quote.total)}
              </button>
              <p className="flex items-center justify-center gap-1.5 text-center text-xs text-ink-muted">
                <ShieldCheck className="h-3.5 w-3.5" /> Payments are processed by Stripe. AyurCare never sees your card details.
              </p>
            </div>
          )}

          {step === 'done' && (
            <div className="py-4 text-center">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-sage text-forest">
                <CheckCircle2 className="h-7 w-7" />
              </span>
              <h4 className="mt-4 font-display text-2xl font-semibold text-ink">
                {doneState === 'confirmed' ? 'Consultation booked' : 'Payment processing'}
              </h4>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-muted">
                {doneState === 'confirmed'
                  ? `Your ${type.toLowerCase()} consultation with ${doctor.name} is confirmed for ${selectedDate?.day}, ${formatTime(time)} IST. A confirmation email is on its way.`
                  : 'Your bank is still processing the payment. Your booking will be confirmed automatically once it completes.'}
              </p>
              <Link
                href="/patient/dashboard"
                className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-forest py-3 text-sm font-semibold text-white hover:bg-forest-deep"
              >
                Go to dashboard
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
