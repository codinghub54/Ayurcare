'use client';

import React, { use, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Loader2,
  AlertCircle,
  CheckCircle2,
  Pill,
  ClipboardList,
  Lock,
  History,
  Plus,
  Trash2,
  FileText,
  WifiOff,
  ArrowLeft,
} from 'lucide-react';
import { useConsultationRoom, type MedicineItem, type Report } from '@/components/consultation/useConsultationRoom';
import CallStage from '@/components/consultation/CallStage';
import ChatPanel from '@/components/consultation/ChatPanel';

type Tab = 'rx' | 'summary' | 'private' | 'history';
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const EMPTY_MED: MedicineItem = { name: '', dosage: '', frequency: '', timing: '', anupana: '', duration: '', notes: '' };
const FREQUENCIES = ['1-0-1', '1-0-0', '0-0-1', '1-1-1', '0-1-0', 'Once a day', 'Twice a day', 'SOS (when needed)'];
const TIMINGS = ['After food', 'Before food', 'Empty stomach', 'At bedtime', 'With food'];
const ANUPANAS = ['Warm water', 'Lukewarm water', 'Honey', 'Warm milk', 'Ghee', 'Buttermilk', 'Coconut water'];
const DURATIONS = ['5 days', '7 days', '14 days', '21 days', '1 month', '2 months', '3 months'];

const input =
  'w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-muted/60 focus:border-forest focus:outline-none focus:ring-4 focus:ring-forest/10 disabled:bg-bg disabled:text-ink-muted';
const textarea = `${input} min-h-[110px] resize-y leading-relaxed`;

function fmt(iso: string) {
  return new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });
}

export default function DoctorConsultationRoom({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const room = useConsultationRoom(id);
  const { data } = room;

  const [tab, setTab] = useState<Tab>('rx');
  const [draft, setDraft] = useState<Report | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveError, setSaveError] = useState('');
  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState('');
  const [catalog, setCatalog] = useState<{ name: string; dosage: string; anupana: string }[]>([]);
  const dirty = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftRef = useRef<Report | null>(null);

  // Load the saved draft once
  useEffect(() => {
    if (data && !draftRef.current) {
      const initial = { ...data.report, privateDoctorNotes: data.report.privateDoctorNotes || '' };
      draftRef.current = initial;
      setDraft(initial);
    }
  }, [data]);

  const completed = room.status === 'COMPLETED';
  const active = room.status === 'CONFIRMED';

  const save = useCallback(async () => {
    const current = draftRef.current;
    if (!current || !dirty.current) return;
    dirty.current = false;
    setSaveState('saving');
    try {
      const body = completed
        ? { privateDoctorNotes: current.privateDoctorNotes }
        : {
            diagnosis: current.diagnosis,
            notes: current.notes,
            dietInstructions: current.dietInstructions,
            lifestyleAdvice: current.lifestyleAdvice,
            medicines: current.medicines,
            privateDoctorNotes: current.privateDoctorNotes,
          };
      const res = await fetch(`/api/consultations/${id}/report`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        dirty.current = true;
        setSaveState('error');
        setSaveError(json.error || 'Could not save.');
        return;
      }
      setSaveState('saved');
      setSaveError('');
    } catch {
      dirty.current = true;
      setSaveState('error');
      setSaveError('You are offline. Changes will be saved when the connection returns.');
    }
  }, [id, completed]);

  // Debounced autosave; retry failed saves every few seconds
  const update = (patch: Partial<Report>) => {
    setDraft((d) => {
      const next = { ...(d as Report), ...patch };
      draftRef.current = next;
      return next;
    });
    dirty.current = true;
    setSaveState('saving');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(save, 900);
  };
  useEffect(() => {
    if (saveState !== 'error') return;
    const t = setTimeout(save, 4000);
    return () => clearTimeout(t);
  }, [saveState, save]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty.current) {
        save();
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [save]);

  const catalogTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchCatalog = useCallback((q: string) => {
    if (catalogTimer.current) clearTimeout(catalogTimer.current);
    catalogTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/consultations/medicines?q=${encodeURIComponent(q)}`);
        if (res.ok) setCatalog((await res.json()).medicines || []);
      } catch {}
    }, 250);
  }, []);

  const setMed = (i: number, patch: Partial<MedicineItem>) => {
    if (!draft) return;
    const meds = draft.medicines.map((m, idx) => (idx === i ? { ...m, ...patch } : m));
    update({ medicines: meds });
  };

  const complete = async () => {
    setCompleteError('');
    if (!confirm('Complete this consultation? The summary and prescription will be shared with the patient and can no longer be edited.')) return;
    setCompleting(true);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    await save();
    try {
      const res = await fetch(`/api/consultations/${id}/complete`, { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) setCompleteError(json.error || 'Could not complete the consultation.');
      else room.call.leave();
    } finally {
      setCompleting(false);
    }
  };

  if (room.loadError) {
    return (
      <div className="mx-auto max-w-lg rounded-3xl border border-line bg-white p-8 text-center">
        <AlertCircle className="mx-auto h-8 w-8 text-red-500" />
        <p className="mt-3 font-semibold text-ink">{room.loadError}</p>
        <Link href="/doctor/dashboard" className="mt-5 inline-block text-sm font-semibold text-forest hover:underline">
          Back to today&apos;s queue
        </Link>
      </div>
    );
  }
  if (!data || !draft) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-ink-muted">
        <Loader2 className="h-5 w-5 animate-spin" /> Opening consultation room…
      </div>
    );
  }

  const ctx = data.patientContext;
  const sharedLocked = completed || !active;

  return (
    <div className="mx-auto max-w-[1400px] space-y-5" id="doctor-consultation-room">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/doctor/dashboard" className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink">
            <ArrowLeft className="h-4 w-4" /> Today&apos;s queue
          </Link>
          <h1 className="mt-1 font-display text-3xl font-semibold text-ink">{ctx?.name || data.appointment.patient.name}</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {data.appointment.type.toLowerCase()} consultation · {fmt(data.appointment.scheduledAt)} IST
            {ctx?.forFamilyMember && ` · ${ctx.forFamilyMember.relation} of ${ctx.forFamilyMember.bookedBy}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {room.connectionLost && (
            <span className="flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800">
              <WifiOff className="h-3.5 w-3.5" /> Reconnecting to server…
            </span>
          )}
          {completed ? (
            <Link
              href={`/consultations/${id}/report`}
              className="inline-flex items-center gap-2 rounded-full bg-forest px-5 py-2.5 text-sm font-semibold text-white hover:bg-forest-deep"
            >
              <FileText className="h-4 w-4" /> View reports
            </Link>
          ) : (
            <button
              onClick={complete}
              disabled={completing || !active}
              className="inline-flex items-center gap-2 rounded-full bg-forest px-5 py-2.5 text-sm font-semibold text-white hover:bg-forest-deep disabled:opacity-50 cursor-pointer"
            >
              {completing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Complete consultation
            </button>
          )}
        </div>
      </div>

      {completeError && (
        <div role="alert" className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {completeError}
        </div>
      )}
      {completed && (
        <div className="flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          This consultation is complete. The summary and prescription are in the patient&apos;s records. Your private notes stay editable.
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-12">
        {/* Call + chat */}
        <div className="space-y-5 xl:col-span-7">
          <CallStage
            type={data.appointment.type}
            peerName={ctx?.name || data.appointment.patient.name}
            peerRoleLabel="Patient"
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
            peerName={data.appointment.patient.name}
            canSend={active}
            closedReason={completed ? 'The consultation is complete, so chat is closed.' : 'Chat is not available for this appointment.'}
            onSend={room.sendMessage}
          />
        </div>

        {/* Clinical workspace */}
        <div className="xl:col-span-5">
          <div className="sticky top-4 rounded-3xl border border-line bg-white">
            <div className="flex gap-1 overflow-x-auto border-b border-line p-2" role="tablist">
              {(
                [
                  ['rx', 'Prescription', Pill],
                  ['summary', 'Summary', ClipboardList],
                  ['private', 'My notes', Lock],
                  ['history', 'History', History],
                ] as const
              ).map(([key, label, Icon]) => (
                <button
                  key={key}
                  role="tab"
                  aria-selected={tab === key}
                  onClick={() => setTab(key)}
                  className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-medium transition cursor-pointer ${
                    tab === key ? 'bg-forest text-white' : 'text-ink-muted hover:bg-bg hover:text-ink'
                  }`}
                >
                  <Icon className="h-4 w-4" /> {label}
                </button>
              ))}
            </div>

            {/* Save status */}
            <div className="flex items-center justify-between px-5 pt-3 text-xs">
              <span className="text-ink-muted">
                {tab === 'private'
                  ? 'Only you can see these notes. They appear here on this patient’s next visit.'
                  : tab === 'history'
                    ? 'Previous visits and records'
                    : sharedLocked
                      ? 'Read-only'
                      : 'The patient sees this update live.'}
              </span>
              {tab !== 'history' && (
                <span className={saveState === 'error' ? 'text-red-600' : 'text-ink-muted'}>
                  {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : saveState === 'error' ? 'Not saved' : ''}
                </span>
              )}
            </div>
            {saveState === 'error' && saveError && <p className="px-5 pt-1 text-xs text-red-600">{saveError}</p>}

            <div className="max-h-[calc(100dvh-14rem)] overflow-y-auto p-5">
              {tab === 'rx' && (
                <div className="space-y-4">
                  {draft.medicines.length === 0 && (
                    <p className="rounded-2xl bg-bg p-4 text-sm text-ink-muted">No medicines yet. Add the first one below.</p>
                  )}
                  <datalist id="catalog-names">
                    {catalog.map((c) => (
                      <option key={c.name} value={c.name} />
                    ))}
                  </datalist>
                  <datalist id="freq-list">{FREQUENCIES.map((v) => <option key={v} value={v} />)}</datalist>
                  <datalist id="timing-list">{TIMINGS.map((v) => <option key={v} value={v} />)}</datalist>
                  <datalist id="anupana-list">{ANUPANAS.map((v) => <option key={v} value={v} />)}</datalist>
                  <datalist id="duration-list">{DURATIONS.map((v) => <option key={v} value={v} />)}</datalist>

                  {draft.medicines.map((m, i) => (
                    <div key={i} className="space-y-2.5 rounded-2xl border border-line p-4">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-forest">{i + 1}</span>
                        <input
                          list="catalog-names"
                          aria-label="Medicine name"
                          placeholder="Medicine or formulation"
                          value={m.name}
                          disabled={sharedLocked}
                          onFocus={() => searchCatalog(m.name)}
                          onChange={(e) => {
                            const name = e.target.value;
                            const match = catalog.find((c) => c.name.toLowerCase() === name.toLowerCase());
                            setMed(i, match ? { name, dosage: m.dosage || match.dosage, anupana: m.anupana || match.anupana } : { name });
                            searchCatalog(name);
                          }}
                          className={`${input} font-semibold`}
                        />
                        {!sharedLocked && (
                          <button
                            type="button"
                            onClick={() => update({ medicines: draft.medicines.filter((_, idx) => idx !== i) })}
                            aria-label={`Remove medicine ${i + 1}`}
                            className="rounded-lg p-2 text-ink-muted hover:bg-red-50 hover:text-red-600 cursor-pointer"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <input aria-label="Dose" placeholder="Dose (e.g. 1 tablet, 3 g)" value={m.dosage} disabled={sharedLocked} onChange={(e) => setMed(i, { dosage: e.target.value })} className={input} />
                        <input list="freq-list" aria-label="Frequency" placeholder="When (e.g. 1-0-1)" value={m.frequency} disabled={sharedLocked} onChange={(e) => setMed(i, { frequency: e.target.value })} className={input} />
                        <input list="timing-list" aria-label="Timing" placeholder="Timing" value={m.timing} disabled={sharedLocked} onChange={(e) => setMed(i, { timing: e.target.value })} className={input} />
                        <input list="anupana-list" aria-label="Take with" placeholder="Take with (Anupana)" value={m.anupana} disabled={sharedLocked} onChange={(e) => setMed(i, { anupana: e.target.value })} className={input} />
                        <input list="duration-list" aria-label="Duration" placeholder="Duration" value={m.duration} disabled={sharedLocked} onChange={(e) => setMed(i, { duration: e.target.value })} className={input} />
                        <input aria-label="Notes" placeholder="Notes (optional)" value={m.notes} disabled={sharedLocked} onChange={(e) => setMed(i, { notes: e.target.value })} className={input} />
                      </div>
                    </div>
                  ))}

                  {!sharedLocked && (
                    <button
                      type="button"
                      onClick={() => update({ medicines: [...draft.medicines, { ...EMPTY_MED }] })}
                      className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-forest/40 py-3 text-sm font-semibold text-forest hover:bg-sage/40 cursor-pointer"
                    >
                      <Plus className="h-4 w-4" /> Add medicine
                    </button>
                  )}
                </div>
              )}

              {tab === 'summary' && (
                <div className="space-y-4">
                  {(
                    [
                      ['diagnosis', 'Assessment', 'Your assessment in plain words, e.g. Vata aggravation with weak Agni.'],
                      ['notes', 'Discussion & recommendations', 'What you discussed, what you suggest, and any follow-up advice.'],
                      ['dietInstructions', 'Diet (Pathya-Apathya)', 'Foods to favour and to avoid.'],
                      ['lifestyleAdvice', 'Lifestyle & routine', 'Sleep, exercise, yoga, pranayama, daily routine.'],
                    ] as const
                  ).map(([key, label, hint]) => (
                    <div key={key}>
                      <label htmlFor={`f-${key}`} className="text-sm font-semibold text-ink">
                        {label}
                      </label>
                      <textarea
                        id={`f-${key}`}
                        value={draft[key]}
                        placeholder={hint}
                        disabled={sharedLocked}
                        onChange={(e) => update({ [key]: e.target.value } as Partial<Report>)}
                        className={`${textarea} mt-1.5`}
                      />
                    </div>
                  ))}
                </div>
              )}

              {tab === 'private' && (
                <div className="space-y-3">
                  <label htmlFor="f-private" className="text-sm font-semibold text-ink">
                    Your summary of this patient
                  </label>
                  <textarea
                    id="f-private"
                    value={draft.privateDoctorNotes || ''}
                    placeholder="In your own words: history, observations (Nadi, Jihva, Prakriti/Vikriti), what you tried, what to check next time…"
                    onChange={(e) => update({ privateDoctorNotes: e.target.value })}
                    className={`${textarea} min-h-[320px]`}
                  />
                </div>
              )}

              {tab === 'history' && ctx && (
                <div className="space-y-5 text-sm">
                  <div className="grid grid-cols-2 gap-3">
                    {(
                      [
                        ['Age', ctx.age != null ? `${ctx.age} years` : null],
                        ['Gender', ctx.gender],
                        ['Blood group', ctx.bloodGroup],
                        ['Prakriti', ctx.prakriti],
                      ] as const
                    ).map(([k, v]) => (
                      <div key={k} className="rounded-xl bg-bg p-3">
                        <p className="text-[11px] uppercase tracking-wide text-ink-muted">{k}</p>
                        <p className="font-semibold text-ink">{v || 'Not recorded'}</p>
                      </div>
                    ))}
                  </div>
                  {(ctx.allergies || ctx.chronicConditions) && (
                    <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900">
                      {ctx.allergies && <p><strong>Allergies:</strong> {ctx.allergies}</p>}
                      {ctx.chronicConditions && <p><strong>Chronic conditions:</strong> {ctx.chronicConditions}</p>}
                    </div>
                  )}

                  <div>
                    <p className="mb-2 font-semibold text-ink">Previous consultations</p>
                    {ctx.previousVisits.length === 0 ? (
                      <p className="text-ink-muted">This is the patient&apos;s first completed consultation on AyurCare.</p>
                    ) : (
                      <div className="space-y-3">
                        {ctx.previousVisits.map((v) => (
                          <div key={v.id} className={`rounded-2xl border p-4 ${v.withMe ? 'border-forest/30 bg-sage/40' : 'border-line'}`}>
                            <p className="text-xs text-ink-muted">
                              {fmt(v.date)} · {v.type.toLowerCase()} · {v.withMe ? 'with you' : `Dr. ${v.doctorName.replace(/^Dr\.?\s*/i, '')}`}
                            </p>
                            {v.diagnosis && <p className="mt-1.5"><strong>Assessment:</strong> {v.diagnosis}</p>}
                            {v.medicines.length > 0 && <p className="mt-1"><strong>Medicines:</strong> {v.medicines.join(', ')}</p>}
                            {v.withMe && v.privateNotes && (
                              <div className="mt-2 rounded-xl bg-white p-3">
                                <p className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-forest">
                                  <Lock className="h-3 w-3" /> Your private notes
                                </p>
                                <p className="mt-1 whitespace-pre-wrap">{v.privateNotes}</p>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <p className="mb-2 font-semibold text-ink">Lab reports</p>
                    {ctx.labReports.length === 0 ? (
                      <p className="text-ink-muted">No lab reports uploaded.</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {ctx.labReports.map((r) => (
                          <li key={r.id} className="flex justify-between gap-3 rounded-xl bg-bg px-3 py-2">
                            <span className="truncate">{r.description || 'Report'}</span>
                            <span className="shrink-0 text-ink-muted">{new Date(r.uploadedAt).toLocaleDateString('en-IN')}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
