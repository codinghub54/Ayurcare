'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, Video, Phone, MessageSquare, Copy, Check, Trash2, ExternalLink, FlaskConical, AlertCircle } from 'lucide-react';

interface Person {
  id: string;
  name: string;
  email: string;
}
interface TestRow {
  id: string;
  type: 'VIDEO' | 'AUDIO' | 'CHAT';
  status: string;
  scheduledAt: string;
  doctorName: string;
  patientName: string;
}

const field =
  'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-600';

function CopyLink({ url, label }: { url: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 shrink-0 text-xs text-slate-400">{label}</span>
      <code className="min-w-0 flex-1 truncate rounded-md bg-slate-950 px-2 py-1.5 text-xs text-slate-300">{url}</code>
      <button
        onClick={() => {
          navigator.clipboard.writeText(url).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
        className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer"
        aria-label={`Copy ${label} link`}
      >
        {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
      </button>
      <a href={url} target="_blank" rel="noopener noreferrer" className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white" aria-label={`Open ${label} link`}>
        <ExternalLink className="h-4 w-4" />
      </a>
    </div>
  );
}

export default function AdminTestCalls() {
  const [doctors, setDoctors] = useState<Person[]>([]);
  const [patients, setPatients] = useState<Person[]>([]);
  const [tests, setTests] = useState<TestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [doctorId, setDoctorId] = useState('');
  const [patientId, setPatientId] = useState('');
  const [type, setType] = useState<'VIDEO' | 'AUDIO' | 'CHAT'>('VIDEO');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [origin] = useState(() => (typeof window !== 'undefined' ? window.location.origin : ''));

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/test-consultations');
      const j = await res.json();
      if (!res.ok) {
        setError(j.error || 'Could not load.');
        return;
      }
      setDoctors(j.doctors);
      setPatients(j.patients);
      setTests(j.tests);
    } catch {
      setError('Could not reach the server.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const create = async () => {
    setError('');
    if (!doctorId || !patientId) {
      setError('Choose a doctor and a patient.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/admin/test-consultations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doctorId, patientId, type }),
      });
      const j = await res.json();
      if (!res.ok) setError(j.error || 'Could not create the test consultation.');
      else await load();
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this test consultation, including its chat and any test prescription?')) return;
    const res = await fetch(`/api/admin/test-consultations?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (res.ok) setTests((t) => t.filter((x) => x.id !== id));
    else setError((await res.json().catch(() => ({}))).error || 'Could not delete.');
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 text-slate-100">
      <div>
        <h1 className="flex items-center gap-2 font-display text-3xl font-bold">
          <FlaskConical className="h-7 w-7 text-emerald-400" /> Test consultations
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Create a free consultation that starts now, to test video, audio and chat between a real doctor account and a real patient account. No
          payment is taken and it does not count towards revenue.
        </p>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
        <h2 className="font-semibold">How to test</h2>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-slate-300">
          <li>Create a test consultation below.</li>
          <li>
            Open the <strong>doctor link</strong> on one device, signed in as that doctor.
          </li>
          <li>
            Open the <strong>patient link</strong> on another device (or a private/incognito window), signed in as that patient.
          </li>
          <li>Press Join now on both. Try muting, the camera, screen sharing, chat, and the live prescription.</li>
        </ol>
        <p className="mt-3 text-sm text-slate-400">
          Each person can first check their camera, microphone and connection at{' '}
          <Link href="/call-test" className="text-emerald-400 hover:underline">
            /call-test
          </Link>
          .
        </p>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
        <h2 className="mb-4 font-semibold">New test consultation</h2>
        {loading ? (
          <p className="flex items-center gap-2 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading accounts…
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto_auto] md:items-end">
            <div>
              <label htmlFor="t-doc" className="mb-1.5 block text-xs font-semibold uppercase text-slate-400">Doctor</label>
              <select id="t-doc" value={doctorId} onChange={(e) => setDoctorId(e.target.value)} className={field}>
                <option value="">Choose a doctor</option>
                {doctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.email})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="t-pat" className="mb-1.5 block text-xs font-semibold uppercase text-slate-400">Patient</label>
              <select id="t-pat" value={patientId} onChange={(e) => setPatientId(e.target.value)} className={field}>
                <option value="">Choose a patient</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.email})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-1 rounded-lg border border-slate-700 bg-slate-950 p-1">
              {(
                [
                  ['VIDEO', Video],
                  ['AUDIO', Phone],
                  ['CHAT', MessageSquare],
                ] as const
              ).map(([t, Icon]) => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  aria-label={`${t.toLowerCase()} consultation`}
                  title={t.toLowerCase()}
                  className={`rounded-md p-2 cursor-pointer ${type === t ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'}`}
                >
                  <Icon className="h-4 w-4" />
                </button>
              ))}
            </div>
            <button
              onClick={create}
              disabled={busy}
              className="flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Create
            </button>
          </div>
        )}
        {!loading && (doctors.length === 0 || patients.length === 0) && (
          <p className="mt-3 text-sm text-amber-300">
            You need at least one approved doctor and one active patient account. Create them in Users.
          </p>
        )}
        {error && (
          <p className="mt-3 flex items-center gap-2 text-sm text-red-300">
            <AlertCircle className="h-4 w-4" /> {error}
          </p>
        )}
      </div>

      <div className="space-y-3">
        <h2 className="font-semibold">Recent test consultations</h2>
        {tests.length === 0 && !loading && <p className="text-sm text-slate-400">None yet.</p>}
        {tests.map((t) => (
          <div key={t.id} className="space-y-3 rounded-xl border border-slate-800 bg-slate-900 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm">
                <strong>{t.doctorName}</strong> with <strong>{t.patientName}</strong>
                <span className="ml-2 text-slate-400">
                  {t.type.toLowerCase()} · {new Date(t.scheduledAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })} · {t.status.toLowerCase()}
                </span>
              </p>
              <button onClick={() => remove(t.id)} className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-slate-400 hover:bg-red-950 hover:text-red-200 cursor-pointer">
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
            </div>
            <CopyLink label="Doctor" url={`${origin}/doctor/consultations/${t.id}`} />
            <CopyLink label="Patient" url={`${origin}/patient/consultations/${t.id}`} />
          </div>
        ))}
      </div>
    </div>
  );
}
