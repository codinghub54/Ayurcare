'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { X, Loader2, ShieldCheck, CheckCircle2, AlertCircle, Video, Phone, MessageSquare, Lock } from 'lucide-react';
import { getConsultFees } from '@/lib/doctor-fees';

type ConsultType = 'VIDEO' | 'AUDIO' | 'CHAT';

export interface BookableDoctor {
  id: string;
  name: string;
  doctorProfile?: { feePerConsult?: number; availability?: string | null; qualification?: string; specializations?: string } | null;
}

interface Props {
  doctor: BookableDoctor;
  initialType?: ConsultType;
  initialDate?: string;
  initialTime?: string;
  onClose: () => void;
}

/* ---------------- Razorpay Checkout loader ---------------- */

interface RazorpaySuccess {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

interface RazorpayInstance {
  open: () => void;
  on: (event: 'payment.failed', cb: (resp: { error?: { description?: string } }) => void) => void;
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

let checkoutScript: Promise<boolean> | null = null;
function loadRazorpayCheckout(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if (window.Razorpay) return Promise.resolve(true);
  if (!checkoutScript) {
    checkoutScript = new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      script.onload = () => resolve(!!window.Razorpay);
      script.onerror = () => {
        checkoutScript = null;
        resolve(false);
      };
      document.body.appendChild(script);
    });
  }
  return checkoutScript;
}

/* ---------------- helpers ---------------- */

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
  return new Date(2000, 0, 1, h, m).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

export default function BookingModal({ doctor, initialType, initialDate, initialTime, onClose }: Props) {
  const dates = useMemo(() => istDates(), []);
  const fees = useMemo(() => getConsultFees(doctor.doctorProfile || {}), [doctor.doctorProfile]);
  const offeredTypes = TYPES.filter((t) => fees[t.value] !== null);

  const [step, setStep] = useState<'details' | 'done'>('details');
  const [type, setType] = useState<ConsultType>(
    initialType && fees[initialType] !== null ? initialType : offeredTypes[0]?.value || 'VIDEO'
  );
  const fee = fees[type];
  const [date, setDate] = useState(initialDate && dates.some((d) => d.iso === initialDate) ? initialDate : dates[0].iso);
  const [slots, setSlots] = useState<string[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(true);
  const [time, setTime] = useState('');
  const wantedTime = useRef<string | undefined>(initialTime);
  const [coupon, setCoupon] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [paidTotal, setPaidTotal] = useState<number | null>(null);
  const appointmentId = useRef<string | null>(null);

  // Warm up the Razorpay script so the payment window opens instantly
  useEffect(() => {
    loadRazorpayCheckout();
  }, []);

  // Load open slots for the chosen date
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setSlotsLoading(true);
      try {
        const res = await fetch(`/api/patient/doctors/${encodeURIComponent(doctor.id)}/slots?date=${date}`);
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        const open: string[] = res.ok && Array.isArray(data.openSlots) ? data.openSlots : [];
        setSlots(open);
        setError(res.ok ? '' : data.error || 'Could not load available times.');
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

  const releaseHold = () => {
    if (!appointmentId.current) return;
    const id = appointmentId.current;
    appointmentId.current = null;
    fetch('/api/patient/checkout/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appointmentId: id }),
    }).catch(() => {});
  };

  const confirmWithServer = async (payment?: RazorpaySuccess) => {
    for (let attempt = 0; attempt < 4; attempt++) {
      const res = await fetch('/api/patient/checkout/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentId: appointmentId.current, ...payment }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.status === 'confirmed') return true;
      if (!res.ok) {
        setError(data.error || 'Could not confirm the payment.');
        return false;
      }
      // Razorpay may take a moment to mark the payment captured
      await new Promise((r) => setTimeout(r, 1500));
    }
    setError('We received your payment but could not confirm it yet. Please check your dashboard in a minute.');
    return false;
  };

  const startPayment = async () => {
    setError('');
    if (!time) {
      setError('Please choose a time.');
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
        setBusy(false);
        return;
      }
      appointmentId.current = data.appointmentId;

      if (data.free) {
        setPaidTotal(0);
        setStep('done');
        setBusy(false);
        return;
      }

      const loaded = await loadRazorpayCheckout();
      if (!loaded || !window.Razorpay) {
        releaseHold();
        setError('Could not load the payment window. Check your connection and try again.');
        setBusy(false);
        return;
      }

      const rp = data.razorpay;
      const checkout = new window.Razorpay({
        key: rp.keyId,
        order_id: rp.orderId,
        amount: rp.amount,
        currency: rp.currency,
        name: 'AyurCare',
        description: `${TYPES.find((t) => t.value === type)?.label} consultation with ${doctor.name}`,
        prefill: rp.prefill,
        notes: { appointmentId: data.appointmentId },
        theme: { color: '#1E5A43' },
        handler: async (resp: RazorpaySuccess) => {
          setBusy(true);
          const ok = await confirmWithServer(resp);
          setBusy(false);
          if (ok) {
            setPaidTotal(data.total);
            setStep('done');
          }
        },
        modal: {
          ondismiss: () => {
            // Closed without paying: free the slot for others
            releaseHold();
            setBusy(false);
          },
        },
      });
      checkout.on('payment.failed', (resp) => {
        setError(resp?.error?.description || 'The payment did not go through. You can try again.');
      });
      checkout.open();
    } catch {
      setError('Could not reach the server. Please try again.');
      setBusy(false);
    }
  };

  const close = () => {
    if (step !== 'done') releaseHold();
    onClose();
  };

  const selectedDate = dates.find((d) => d.iso === date);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`Book ${doctor.name}`}
    >
      <div className="relative max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white shadow-2xl animate-slideUp sm:rounded-3xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-line bg-white/95 px-6 py-5 backdrop-blur">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-forest">{step === 'done' ? 'Booking' : 'Book a consultation'}</p>
            <h3 className="mt-0.5 font-display text-xl font-semibold text-ink">{doctor.name}</h3>
            {doctor.doctorProfile?.qualification && <p className="text-xs text-ink-muted">{doctor.doctorProfile.qualification}</p>}
          </div>
          <button onClick={close} disabled={busy && step !== 'done'} className="rounded-full p-1.5 text-ink-muted hover:bg-bg hover:text-ink cursor-pointer disabled:opacity-40" aria-label="Close">
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
                <div className={`grid gap-2 ${offeredTypes.length === 3 ? 'grid-cols-3' : offeredTypes.length === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  {offeredTypes.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setType(t.value)}
                      className={`flex flex-col items-center gap-1 rounded-2xl border py-3 text-sm font-medium transition cursor-pointer ${
                        type === t.value ? 'border-forest bg-sage text-forest' : 'border-line text-ink-muted hover:border-forest/40'
                      }`}
                    >
                      <t.icon className="h-4 w-4" /> {t.label}
                      <span className="text-xs font-semibold text-ink">{rupees(fees[t.value] as number)}</span>
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
                onClick={startPayment}
                disabled={busy || slotsLoading || !time}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-forest py-3.5 text-[15px] font-semibold text-white transition hover:bg-forest-deep disabled:opacity-50 cursor-pointer"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                {fee != null && !coupon.trim() ? `Pay ${rupees(fee)}` : 'Continue to payment'}
              </button>
              <p className="flex items-center justify-center gap-1.5 text-center text-xs text-ink-muted">
                <ShieldCheck className="h-3.5 w-3.5" /> Secure payment by Razorpay: cards, UPI, netbanking and wallets.
              </p>
            </div>
          )}

          {step === 'done' && (
            <div className="py-4 text-center">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-sage text-forest">
                <CheckCircle2 className="h-7 w-7" />
              </span>
              <h4 className="mt-4 font-display text-2xl font-semibold text-ink">Consultation booked</h4>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-muted">
                Your {type.toLowerCase()} consultation with {doctor.name} is confirmed for {selectedDate?.day}, {formatTime(time)} IST
                {paidTotal ? ` (paid ${rupees(paidTotal)})` : ''}. A confirmation email is on its way.
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
