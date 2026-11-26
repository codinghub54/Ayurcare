'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { Eye, EyeOff, Loader2, Stethoscope } from 'lucide-react';
import AuthShell, { authInput, authLabel, authPrimaryButton } from '@/components/auth/AuthShell';

function DoctorLoginContent() {
  const { login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [forgotPasswordMode, setForgotPasswordMode] = useState(false);

  // Forgot password flow states
  const [resetEmail, setResetEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [resetStep, setResetStep] = useState(1);
  const [resetUserId, setResetUserId] = useState('');
  const [resetSuccess, setResetSuccess] = useState('');

  useEffect(() => {
    const errorQuery = searchParams.get('error');
    if (errorQuery === 'suspended') {
      setError('Your physician account has been suspended. Please contact the administrative support team.');
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!email || !email.includes('@')) {
      setError('Invalid email format');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, role: 'DOCTOR' }),
      });
      const data = await res.json();

      if (res.ok) {
        login(data.user);
      } else {
        if (data.unverified) {
          router.push(`/patient/verify-otp?userId=${data.userId}`);
        } else if (data.pendingApproval) {
          // If medical license is pending review, show specific error
          setError(data.error);
        } else {
          setError(data.error || 'Incorrect email or password');
        }
      }
    } catch (err) {
      setError('Failed to connect to the server.');
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
        setError('Please enter a valid email address');
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
          setResetSuccess('Reset code sent! Check your inbox.');
          setResetStep(2);
        } else {
          setError(data.error || 'Error sending code.');
        }
      } catch (err) {
        setError('Server error.');
      } finally {
        setLoading(false);
      }
    } else {
      if (!resetCode || !newPassword) {
        setError('All fields are required');
        return;
      }
      if (newPassword.length < 8) {
        setError('Password must be at least 8 characters');
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
          setResetSuccess('Password reset successfully! You can now log in.');
          setTimeout(() => {
            setForgotPasswordMode(false);
            setResetStep(1);
            setResetEmail('');
            setResetCode('');
            setNewPassword('');
            setResetSuccess('');
          }, 3000);
        } else {
          setError(data.error || 'Invalid reset code');
        }
      } catch (err) {
        setError('Server error.');
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <AuthShell
      eyebrow="Physician portal"
      headline="Your online Ayurvedic practice, in one workspace."
      points={[
        "Today's consultation queue at a glance",
        'Patient history and Prakriti before each call',
        'Structured digital prescriptions',
      ]}
    >
      <div id="doctor-login-page">
          <div className="mb-7">
            <h2 className="font-display text-3xl font-semibold text-ink">
              {forgotPasswordMode ? 'Reset your password' : 'Physician sign in'}
            </h2>
            <p className="mt-2 text-ink-muted">
              {forgotPasswordMode
                ? 'Follow the steps to reset your password.'
                : 'Access your consultation queue, schedule and patients.'}
            </p>
          </div>

          {error && (
            <div className="bg-red-50 text-red-700 p-3 rounded-xl border border-red-200 text-sm mb-6 font-medium leading-relaxed">
              {error}
            </div>
          )}
          {resetSuccess && (
            <div className="bg-emerald-50 text-emerald-800 p-3 rounded-xl border border-emerald-200 text-sm mb-6 font-medium">
              {resetSuccess}
            </div>
          )}

          {forgotPasswordMode ? (
            <form onSubmit={handleForgotPasswordSubmit} className="space-y-5">
              {resetStep === 1 ? (
                <div>
                  <label htmlFor="reset-email" className={authLabel}>Registered Email Address</label>
                  <input
                    id="reset-email"
                    type="email"
                    required
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    placeholder="you@example.com"
                    className={`${authInput}`}
                  />
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label htmlFor="reset-code" className={authLabel}>6-Digit OTP Code</label>
                    <input
                      id="reset-code"
                      type="text"
                      required
                      maxLength={6}
                      value={resetCode}
                      onChange={(e) => setResetCode(e.target.value)}
                      placeholder="Enter code"
                      className={`${authInput} tracking-widest text-center text-lg font-bold placeholder-slate-400`}
                    />
                  </div>
                  <div>
                    <label htmlFor="new-password" className={authLabel}>New Secure Password</label>
                    <input
                      id="new-password"
                      type="password"
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="8+ chars (1 number, 1 symbol)"
                      className={`${authInput}`}
                    />
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className={authPrimaryButton}
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : null}
                {resetStep === 1 ? 'Send Verification OTP' : 'Reset My Password'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setForgotPasswordMode(false);
                  setResetStep(1);
                  setError('');
                }}
                className="w-full text-center text-sm font-semibold text-forest hover:underline cursor-pointer"
              >
                Back to Login
              </button>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="email-field" className={authLabel}>Email Address</label>
                <input
                  id="email-field"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className={`${authInput}`}
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <label htmlFor="password-field" className="text-sm font-semibold text-slate-700">Password</label>
                  <button
                    type="button"
                    onClick={() => setForgotPasswordMode(true)}
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
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    className={`${authInput} pr-10`}
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
                className={authPrimaryButton}
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : null}
                Sign in
              </button>

              <div className="text-center text-sm font-medium text-slate-600 mt-6">
                Not on AyurCare yet?{' '}
                <Link href="/doctor/signup" className="text-forest font-semibold hover:underline">
                  Apply as a physician
                </Link>
              </div>
            </form>
          )}
          <div className="mt-8 rounded-2xl border border-line bg-white p-4 text-sm text-ink-muted">
            Looking for patient care?{' '}
            <Link href="/patient/login" className="font-semibold text-forest hover:underline">
              Patient sign in
            </Link>
          </div>
      </div>
    </AuthShell>
  );
}

export default function DoctorLogin() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-bg text-sm text-ink-muted">Loading…</div>
    }>
      <DoctorLoginContent />
    </Suspense>
  );
}
