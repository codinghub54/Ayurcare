'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { Eye, EyeOff, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import AuthShell, { authInput, authLabel, authPrimaryButton } from '@/components/auth/AuthShell';

declare global {
  interface Window {
    google?: any;
  }
}

function PatientLoginContent() {
  const { login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [forgotPasswordMode, setForgotPasswordMode] = useState(false);

  // Forgot password flow
  const [resetEmail, setResetEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [resetStep, setResetStep] = useState(1); // 1: enter email, 2: enter code & new password
  const [resetUserId, setResetUserId] = useState('');
  const [resetSuccess, setResetSuccess] = useState('');

  useEffect(() => {
    if (searchParams.get('error') === 'suspended') {
      setError('Your account has been suspended. Please contact AyurCare support for help.');
    }
  }, [searchParams]);

  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const googleEnabled = !!googleClientId && googleClientId !== 'mock_client_id';

  const handleGoogleLoginSuccess = async (response: any) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/google-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: response.credential }),
      });
      const data = await res.json();
      if (res.ok) {
        login(data.user);
      } else {
        setError(data.error || 'Google sign-in failed.');
      }
    } catch {
      setError('Could not reach the server during Google sign-in.');
    } finally {
      setLoading(false);
    }
  };

  // Load Google Identity Services and render the official button (only when configured)
  useEffect(() => {
    if (!googleEnabled || forgotPasswordMode) return;

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);

    script.onload = () => {
      if (!window.google) return;
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: handleGoogleLoginSuccess,
      });
      const container = document.getElementById('google-signin-btn-container');
      if (container) {
        window.google.accounts.id.renderButton(container, {
          theme: 'outline',
          size: 'large',
          shape: 'pill',
          text: 'continue_with',
          width: Math.min(container.clientWidth || 380, 400),
        });
      }
    };

    return () => {
      if (script.parentNode) script.parentNode.removeChild(script);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleEnabled, googleClientId, forgotPasswordMode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email || !email.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, role: 'PATIENT' }),
      });
      const data = await res.json();

      if (res.ok) {
        login(data.user);
      } else if (data.unverified) {
        router.push(`/patient/verify-otp?userId=${data.userId}`);
      } else {
        setError(data.error || 'Incorrect email or password.');
      }
    } catch {
      setError('Failed to connect to the server. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setResetSuccess('');

    if (resetStep === 1) {
      if (!resetEmail || !resetEmail.includes('@')) {
        setError('Please enter a valid email address.');
        return;
      }
      setLoading(true);
      try {
        const res = await fetch('/api/auth/forgot-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: resetEmail }),
        });
        const data = await res.json();
        if (res.ok) {
          setResetUserId(data.userId);
          setResetSuccess('We sent a reset code to your email.');
          setResetStep(2);
        } else {
          setError(data.error || 'Could not send the reset code.');
        }
      } catch {
        setError('Server error. Please try again.');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!resetCode || !newPassword) {
      setError('Please enter the code and a new password.');
      return;
    }
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: resetUserId, code: resetCode, newPassword }),
      });
      const data = await res.json();
      if (res.ok) {
        setResetSuccess('Password updated. You can sign in now.');
        setTimeout(() => {
          setForgotPasswordMode(false);
          setResetStep(1);
          setResetCode('');
          setNewPassword('');
          setResetSuccess('');
        }, 2500);
      } else {
        setError(data.error || 'That code is not valid.');
      }
    } catch {
      setError('Server error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      eyebrow="Patient portal"
      headline="Welcome back to your path to balance."
      points={[
        'See upcoming consultations and join video calls',
        'Review prescriptions and lab reports',
        'Pick up your yoga, diet and breathing routines',
      ]}
    >
      <div id="patient-login-page">
        <h2 className="font-display text-3xl font-semibold text-ink">
          {forgotPasswordMode ? 'Reset your password' : 'Sign in'}
        </h2>
        <p className="mt-2 text-ink-muted">
          {forgotPasswordMode ? (
            resetStep === 1 ? (
              "Enter the email you registered with and we'll send you a code."
            ) : (
              'Enter the code from your email and choose a new password.'
            )
          ) : (
            <>
              New to AyurCare?{' '}
              <Link href="/patient/signup" className="font-semibold text-forest hover:underline">
                Create an account
              </Link>
            </>
          )}
        </p>

        {error && (
          <div role="alert" className="mt-6 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {resetSuccess && (
          <div role="status" className="mt-6 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{resetSuccess}</span>
          </div>
        )}

        {forgotPasswordMode ? (
          <form onSubmit={handleForgotPasswordSubmit} className="mt-7 space-y-4">
            {resetStep === 1 ? (
              <div>
                <label htmlFor="reset-email" className={authLabel}>Email</label>
                <input
                  id="reset-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  placeholder="you@example.com"
                  className={authInput}
                />
              </div>
            ) : (
              <>
                <div>
                  <label htmlFor="reset-code" className={authLabel}>6-digit code</label>
                  <input
                    id="reset-code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    required
                    maxLength={6}
                    value={resetCode}
                    onChange={(e) => setResetCode(e.target.value.replace(/\D/g, ''))}
                    className={`${authInput} text-center text-lg font-semibold tracking-[0.5em]`}
                  />
                </div>
                <div>
                  <label htmlFor="new-password" className={authLabel}>New password</label>
                  <input
                    id="new-password"
                    type="password"
                    required
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    className={authInput}
                  />
                </div>
              </>
            )}

            <button type="submit" disabled={loading} className={`${authPrimaryButton} !mt-6`}>
              {loading && <Loader2 className="h-5 w-5 animate-spin" />}
              {resetStep === 1 ? 'Send reset code' : 'Reset password'}
            </button>

            <button
              type="button"
              onClick={() => {
                setForgotPasswordMode(false);
                setResetStep(1);
                setError('');
                setResetSuccess('');
              }}
              className="w-full text-center text-sm font-semibold text-forest hover:underline cursor-pointer"
            >
              Back to sign in
            </button>
          </form>
        ) : (
          <form onSubmit={handleSubmit} className="mt-7 space-y-4">
            <div>
              <label htmlFor="email-field" className={authLabel}>Email</label>
              <input
                id="email-field"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className={authInput}
              />
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label htmlFor="password-field" className="text-sm font-semibold text-ink">Password</label>
                <button
                  type="button"
                  onClick={() => {
                    setForgotPasswordMode(true);
                    setResetEmail(email);
                    setError('');
                  }}
                  className="text-sm font-semibold text-forest hover:underline cursor-pointer"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <input
                  id="password-field"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${authInput} pr-11`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink cursor-pointer"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading} className={`${authPrimaryButton} !mt-6`}>
              {loading && <Loader2 className="h-5 w-5 animate-spin" />}
              Sign in
            </button>

            {googleEnabled && (
              <>
                <div className="flex items-center gap-4 py-1">
                  <div className="h-px flex-1 bg-line" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">or</span>
                  <div className="h-px flex-1 bg-line" />
                </div>
                <div id="google-signin-btn-container" className="flex w-full justify-center" />
              </>
            )}
          </form>
        )}

        {!forgotPasswordMode && (
          <div className="mt-8 rounded-2xl border border-line bg-white p-4 text-sm text-ink-muted">
            Are you a physician?{' '}
            <Link href="/doctor/login" className="font-semibold text-forest hover:underline">
              Sign in to the clinic portal
            </Link>
          </div>
        )}
      </div>
    </AuthShell>
  );
}

export default function PatientLogin() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-bg text-sm text-ink-muted">Loading…</div>}>
      <PatientLoginContent />
    </Suspense>
  );
}
