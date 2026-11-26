'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { Eye, EyeOff, Loader2, ShieldCheck, AlertCircle } from 'lucide-react';
import { LogoMark } from '@/components/brand/Logo';

export default function AdminLogin() {
  const { login } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [smsOtpRequired, setSmsOtpRequired] = useState(false);
  const [smsOtp, setSmsOtp] = useState('');
  const [maskedPhone, setMaskedPhone] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email || !password) {
      setError('Please enter admin credentials.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, role: 'ADMIN' }),
      });
      const data = await res.json();

      if (res.ok) {
        if (data.requiresSmsOtp) {
          setSmsOtpRequired(true);
          setMaskedPhone(data.maskedPhone || 'the administrator email');
          setPassword('');
        } else if (data.user) {
          login(data.user);
        }
      } else {
        setError(data.error || 'Invalid credentials');
      }
    } catch (err) {
      setError('Failed to reach the authentication server.');
    } finally {
      setLoading(false);
    }
  };

  const handleSmsOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/admin-login/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: smsOtp }),
      });
      const data = await res.json();
      if (res.ok && data.user) {
        login(data.user);
      } else {
        setError(data.error || 'Could not verify the code.');
      }
    } catch {
      setError('Failed to reach the authentication server.');
    } finally {
      setLoading(false);
    }
  };

  const returnToPassword = () => {
    setSmsOtpRequired(false);
    setSmsOtp('');
    setError('');
  };

  return (
    <main className="relative min-h-screen flex items-center justify-center overflow-hidden bg-[#0E1A14] p-6 bg-leaf-pattern" id="admin-login-page">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-2xl sm:p-10">
        <div className="flex items-center gap-3">
          <LogoMark className="h-10 w-10" />
          <div className="leading-tight">
            <p className="font-display text-xl font-semibold text-ink">AyurCare</p>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-muted">Administration</p>
          </div>
        </div>

        <h1 className="mt-8 font-display text-3xl font-semibold text-ink">
          {smsOtpRequired ? 'Verify it’s you' : 'Administrator sign in'}
        </h1>
        <p className="mt-2 flex items-center gap-1.5 text-sm text-ink-muted">
          <ShieldCheck className="h-4 w-4 text-forest" /> Protected by email two-step verification
        </p>

        {error && (
          <div role="alert" className="mt-6 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {smsOtpRequired ? (
          <form onSubmit={handleSmsOtpSubmit} className="mt-7 space-y-5">
            <p className="text-sm text-ink-muted">
              Enter the verification code sent to <strong>{maskedPhone}</strong>.
            </p>
            <div>
              <label htmlFor="admin-sms-otp" className="mb-1.5 block text-sm font-semibold text-ink">Verification code</label>
              <input
                id="admin-sms-otp"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{4,10}"
                maxLength={10}
                required
                value={smsOtp}
                onChange={(e) => setSmsOtp(e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="Code from email"
                className="w-full rounded-xl border border-line bg-white px-4 py-3 text-[15px] text-ink placeholder:text-ink-muted/60 focus:border-forest focus:outline-none focus:ring-4 focus:ring-forest/10"
              />
            </div>
            <button
              type="submit"
              disabled={loading || smsOtp.length < 4}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-forest py-3.5 text-[15px] font-semibold text-white transition hover:bg-forest-deep disabled:opacity-60 cursor-pointer"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
              Verify and continue
            </button>
            <button
              type="button"
              onClick={returnToPassword}
              className="w-full text-sm font-semibold text-slate-500 hover:text-slate-800"
            >
              Back to password sign-in
            </button>
          </form>
        ) : (
        <form onSubmit={handleSubmit} className="mt-7 space-y-5">
          <div>
            <label htmlFor="admin-email" className="mb-1.5 block text-sm font-semibold text-ink">Email</label>
            <input
              id="admin-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-xl border border-line bg-white px-4 py-3 text-[15px] text-ink placeholder:text-ink-muted/60 focus:border-forest focus:outline-none focus:ring-4 focus:ring-forest/10"
            />
          </div>

          <div>
            <label htmlFor="admin-pass" className="mb-1.5 block text-sm font-semibold text-ink">Password</label>
            <div className="relative">
              <input
                id="admin-pass"
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-xl border border-line bg-white px-4 py-3 text-[15px] text-ink placeholder:text-ink-muted/60 focus:border-forest focus:outline-none focus:ring-4 focus:ring-forest/10 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-forest py-3.5 text-[15px] font-semibold text-white transition hover:bg-forest-deep disabled:opacity-60 cursor-pointer"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
            Continue
          </button>
        </form>
        )}

        <div className="mt-8 border-t border-line pt-5 text-xs leading-relaxed text-ink-muted">
          Restricted to authorised AyurCare administrators. Administrative actions are recorded in the audit trail.
        </div>
      </div>
    </main>
  );
}
