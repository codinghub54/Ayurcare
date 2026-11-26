'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, AlertCircle, Eye, EyeOff } from 'lucide-react';
import AuthShell, { authInput, authLabel, authPrimaryButton } from '@/components/auth/AuthShell';

export default function PatientSignup() {
  const router = useRouter();
  
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState<'weak' | 'medium' | 'strong' | ''>('');

  // Password strength check hook
  useEffect(() => {
    if (!password) {
      setPasswordStrength('');
      return;
    }

    const hasNumber = /[0-9]/.test(password);
    const hasSymbol = /[^A-Za-z0-9]/.test(password);
    const isLongEnough = password.length >= 8;

    if (isLongEnough && hasNumber && hasSymbol) {
      setPasswordStrength('strong');
    } else if (password.length >= 6 && (hasNumber || hasSymbol)) {
      setPasswordStrength('medium');
    } else {
      setPasswordStrength('weak');
    }
  }, [password]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Field checks
    if (!name || !email || !password || !phone) {
      setError('All fields are mandatory');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (passwordStrength !== 'strong') {
      setError('Password must meet minimum strength requirements (8+ characters, at least one number and one symbol)');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          phone,
          password,
          role: 'PATIENT',
        }),
      });
      const data = await res.json();

      if (res.ok) {
        // Redirect to OTP verification page
        router.push(`/patient/verify-otp?userId=${data.userId}`);
      } else {
        setError(data.error || 'Registration failed');
      }
    } catch (err) {
      setError('Failed to connect to the server. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const getStrengthBarColor = () => {
    if (passwordStrength === 'weak') return 'bg-red-500 w-1/3';
    if (passwordStrength === 'medium') return 'bg-amber-500 w-2/3';
    if (passwordStrength === 'strong') return 'bg-forest w-full';
    return 'bg-slate-200 w-0';
  };

  const getStrengthText = () => {
    if (passwordStrength === 'weak') return 'Weak: add numbers and symbols';
    if (passwordStrength === 'medium') return 'Almost there: use 8+ characters with a number and a symbol';
    if (passwordStrength === 'strong') return 'Strong password';
    return '';
  };

  return (
    <AuthShell
      eyebrow="Patient portal"
      headline="Personal Ayurvedic care, one account away."
      points={[
        'Discover your Prakriti with a guided quiz',
        'Book video consultations with approved physicians',
        'Keep prescriptions and lab reports in one place',
      ]}
    >
      <div id="patient-signup-page">
        <h2 className="font-display text-3xl font-semibold text-ink">Create your account</h2>
        <p className="mt-2 text-ink-muted">
          Already registered?{' '}
          <Link href="/patient/login" className="font-semibold text-forest hover:underline">
            Sign in
          </Link>
        </p>

        {error && (
          <div role="alert" className="mt-6 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-7 space-y-4">
          <div>
            <label htmlFor="name-field" className={authLabel}>Full name</label>
            <input id="name-field" type="text" required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className={authInput} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="email-field" className={authLabel}>Email</label>
              <input id="email-field" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className={authInput} />
            </div>
            <div>
              <label htmlFor="phone-field" className={authLabel}>Mobile number</label>
              <input id="phone-field" type="tel" required autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91" className={authInput} />
            </div>
          </div>

          <div>
            <label htmlFor="password-field" className={authLabel}>Password</label>
            <div className="relative">
              <input
                id="password-field"
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="8+ characters, a number and a symbol"
                className={`${authInput} pr-11`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink cursor-pointer"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
            {password && (
              <div className="mt-2">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-line/70">
                  <div className={`h-full rounded-full transition-all duration-300 ${getStrengthBarColor()}`}></div>
                </div>
                <span
                  className={`mt-1 block text-xs font-medium ${
                    passwordStrength === 'weak' ? 'text-red-600' : passwordStrength === 'medium' ? 'text-amber-700' : 'text-forest'
                  }`}
                >
                  {getStrengthText()}
                </span>
              </div>
            )}
          </div>

          <div>
            <label htmlFor="confirm-field" className={authLabel}>Confirm password</label>
            <input
              id="confirm-field"
              type={showPassword ? 'text' : 'password'}
              required
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={authInput}
            />
          </div>

          <button type="submit" disabled={loading} className={`${authPrimaryButton} !mt-6`}>
            {loading && <Loader2 className="h-5 w-5 animate-spin" />}
            Create account
          </button>
          <p className="text-center text-xs leading-relaxed text-ink-muted">
            We&apos;ll email you a one-time code to verify your address.
          </p>
        </form>

        <div className="mt-8 rounded-2xl border border-line bg-white p-4 text-sm text-ink-muted">
          Are you an Ayurvedic physician?{' '}
          <Link href="/doctor/signup" className="font-semibold text-forest hover:underline">
            Apply to join AyurCare
          </Link>
        </div>
      </div>
    </AuthShell>
  );
}
