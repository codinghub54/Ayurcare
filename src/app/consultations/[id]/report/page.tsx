'use client';

import React, { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, Printer, ArrowLeft, AlertCircle } from 'lucide-react';
import Logo from '@/components/brand/Logo';
import { SummaryReport, PrescriptionReport } from '@/components/consultation/ReportView';
import type { RoomData } from '@/components/consultation/useConsultationRoom';

function fmt(iso: string) {
  return new Date(iso).toLocaleString('en-IN', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Kolkata' });
}

/**
 * The two consultation reports, printable / savable as PDF:
 *  1. Consultation summary (assessment, discussion, diet, lifestyle)
 *  2. Prescription (medicines)
 * The doctor's private notes are never included.
 */
export default function ConsultationReports({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<RoomData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/consultations/${id}`);
        const json = await res.json().catch(() => ({}));
        if (!res.ok) setError(json.error || 'Could not load the reports.');
        else setData(json);
      } catch {
        setError('Could not reach the server.');
      }
    })();
  }, [id]);

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-bg p-6">
        <div className="max-w-md rounded-3xl border border-line bg-white p-8 text-center">
          <AlertCircle className="mx-auto h-8 w-8 text-red-500" />
          <p className="mt-3 font-semibold text-ink">{error}</p>
          <Link href="/" className="mt-5 inline-block text-sm font-semibold text-forest hover:underline">Back to AyurCare</Link>
        </div>
      </main>
    );
  }
  if (!data) {
    return (
      <main className="flex min-h-screen items-center justify-center gap-2 bg-bg text-ink-muted">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading reports…
      </main>
    );
  }

  const { appointment, report, me } = data;
  const backHref = me.role === 'DOCTOR' ? `/doctor/consultations/${id}` : `/patient/consultations/${id}`;
  const isFinal = report.status === 'FINAL';
  const patientName = data.patientContext?.name || appointment.patient.name;

  const header = (title: string) => (
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-5">
      <div>
        <Logo href={null} />
        <h2 className="mt-4 font-display text-2xl font-semibold text-ink">{title}</h2>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-ink-muted">Patient</dt>
        <dd className="font-semibold text-ink">{patientName}</dd>
        <dt className="text-ink-muted">Physician</dt>
        <dd className="text-ink">
          {appointment.doctor.name}
          {appointment.doctor.qualification ? `, ${appointment.doctor.qualification}` : ''}
        </dd>
        <dt className="text-ink-muted">Consultation</dt>
        <dd className="text-ink">
          {fmt(appointment.scheduledAt)} IST · {appointment.type.toLowerCase()}
        </dd>
      </dl>
    </div>
  );

  return (
    <main className="min-h-screen bg-bg px-4 py-8 print:bg-white print:p-0">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center justify-between print:hidden">
          <Link href={backHref} className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink">
            <ArrowLeft className="h-4 w-4" /> Back to consultation
          </Link>
          <button
            onClick={() => window.print()}
            disabled={!isFinal}
            className="inline-flex items-center gap-2 rounded-full bg-forest px-5 py-2.5 text-sm font-semibold text-white hover:bg-forest-deep disabled:opacity-50 cursor-pointer"
          >
            <Printer className="h-4 w-4" /> Print or save as PDF
          </button>
        </div>

        {!isFinal && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 print:hidden">
            These reports are not final yet. They become final when the doctor completes the consultation.
          </div>
        )}

        <section className="rounded-3xl border border-line bg-white p-8 print:rounded-none print:border-0 print:p-0">
          {header('Consultation summary')}
          <div className="pt-6">
            <SummaryReport report={report} emptyText="No summary was written for this consultation." />
          </div>
        </section>

        <section className="rounded-3xl border border-line bg-white p-8 print:break-before-page print:rounded-none print:border-0 print:p-0">
          {header('Prescription')}
          <div className="pt-6">
            <PrescriptionReport report={report} emptyText="No medicines were prescribed in this consultation." />
          </div>
          <p className="mt-8 border-t border-line pt-4 text-xs leading-relaxed text-ink-muted">
            Issued through AyurCare by the physician named above. Take medicines only as directed. Contact your physician if symptoms
            worsen, and call 112 in an emergency.
          </p>
        </section>
      </div>
    </main>
  );
}
