'use client';

import React, { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, AlertCircle, CheckCircle2, Pill, ClipboardList, FileText, WifiOff, ArrowLeft, Radio } from 'lucide-react';
import { useConsultationRoom } from '@/components/consultation/useConsultationRoom';
import CallStage from '@/components/consultation/CallStage';
import ChatPanel from '@/components/consultation/ChatPanel';
import { SummaryReport, PrescriptionReport } from '@/components/consultation/ReportView';

function fmt(iso: string) {
  return new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });
}

export default function PatientConsultationRoom({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const room = useConsultationRoom(id);
  const { data, liveReport } = room;
  const [tab, setTab] = useState<'rx' | 'summary'>('rx');
  // Show "Doctor is writing…" for a few seconds after each change from the doctor
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const updatedAt = liveReport?.updatedAt;
  const justUpdated = !!updatedAt && now - new Date(updatedAt).getTime() < 6000;

  if (room.loadError) {
    return (
      <div className="mx-auto max-w-lg rounded-3xl border border-line bg-white p-8 text-center">
        <AlertCircle className="mx-auto h-8 w-8 text-red-500" />
        <p className="mt-3 font-semibold text-ink">{room.loadError}</p>
        <Link href="/patient/dashboard" className="mt-5 inline-block text-sm font-semibold text-forest hover:underline">
          Back to dashboard
        </Link>
      </div>
    );
  }
  if (!data || !liveReport) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-ink-muted">
        <Loader2 className="h-5 w-5 animate-spin" /> Opening consultation room…
      </div>
    );
  }

  const completed = room.status === 'COMPLETED';
  const active = room.status === 'CONFIRMED';
  const doctorName = data.appointment.doctor.name;

  return (
    <div className="mx-auto max-w-[1400px] space-y-5" id="patient-consultation-room">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/patient/dashboard" className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink">
            <ArrowLeft className="h-4 w-4" /> Dashboard
          </Link>
          <h1 className="mt-1 font-display text-3xl font-semibold text-ink">Consultation with {doctorName}</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {data.appointment.type.toLowerCase()} consultation · {fmt(data.appointment.scheduledAt)} IST
            {data.appointment.doctor.qualification ? ` · ${data.appointment.doctor.qualification}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {room.connectionLost && (
            <span className="flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800">
              <WifiOff className="h-3.5 w-3.5" /> Reconnecting…
            </span>
          )}
          {completed && (
            <Link
              href={`/consultations/${id}/report`}
              className="inline-flex items-center gap-2 rounded-full bg-forest px-5 py-2.5 text-sm font-semibold text-white hover:bg-forest-deep"
            >
              <FileText className="h-4 w-4" /> Open reports
            </Link>
          )}
        </div>
      </div>

      {completed && (
        <div className="flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          Your consultation is complete. The summary and prescription below are saved in your medical records.
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-12">
        <div className="space-y-5 xl:col-span-7">
          <CallStage
            type={data.appointment.type}
            peerName={doctorName}
            peerRoleLabel="Your physician"
            peer={room.peer}
            windowOpen={room.windowOpen}
            opensAt={data.window.opensAt}
            active={active}
            call={room.call}
          />
          <ChatPanel
            className={data.appointment.type === 'CHAT' ? 'h-[560px]' : 'h-[380px]'}
            messages={room.messages}
            myId={data.me.id}
            peerName={doctorName}
            canSend={active}
            closedReason={completed ? 'The consultation is complete, so chat is closed.' : 'Chat is not available for this appointment.'}
            onSend={room.sendMessage}
          />
        </div>

        <div className="xl:col-span-5">
          <div className="sticky top-4 rounded-3xl border border-line bg-white">
            <div className="flex items-center justify-between gap-2 border-b border-line p-2">
              <div className="flex gap-1" role="tablist">
                {(
                  [
                    ['rx', 'Prescription', Pill],
                    ['summary', 'Consultation summary', ClipboardList],
                  ] as const
                ).map(([key, label, Icon]) => (
                  <button
                    key={key}
                    role="tab"
                    aria-selected={tab === key}
                    onClick={() => setTab(key)}
                    className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-medium transition cursor-pointer ${
                      tab === key ? 'bg-forest text-white' : 'text-ink-muted hover:bg-bg hover:text-ink'
                    }`}
                  >
                    <Icon className="h-4 w-4" /> {label}
                  </button>
                ))}
              </div>
              {!completed && active && (
                <span className={`mr-2 flex items-center gap-1.5 text-xs font-semibold ${justUpdated ? 'text-forest' : 'text-ink-muted'}`}>
                  <Radio className={`h-3.5 w-3.5 ${justUpdated ? 'animate-pulse' : ''}`} /> {justUpdated ? 'Doctor is writing…' : 'Live'}
                </span>
              )}
            </div>
            <div className="max-h-[calc(100dvh-12rem)] overflow-y-auto p-5">
              {!completed && (
                <p className="mb-4 rounded-xl bg-bg px-3 py-2 text-xs text-ink-muted">
                  Your doctor fills this in during the consultation. It becomes final when the doctor completes the consultation.
                </p>
              )}
              {tab === 'rx' ? (
                <PrescriptionReport report={liveReport} emptyText="Medicines will appear here as your doctor prescribes them." />
              ) : (
                <SummaryReport report={liveReport} emptyText="Your doctor's notes will appear here during the consultation." />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
