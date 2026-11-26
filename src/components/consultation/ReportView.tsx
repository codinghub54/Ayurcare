import React from 'react';
import { ClipboardList, Pill } from 'lucide-react';
import type { Report } from './useConsultationRoom';

const has = (s?: string) => !!s && s.trim().length > 0;

function Section({ title, body }: { title: string; body?: string }) {
  if (!has(body)) return null;
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-forest">{title}</p>
      <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-ink">{body}</p>
    </div>
  );
}

/** Report 1: what the doctor discussed and suggested. */
export function SummaryReport({ report, emptyText }: { report: Report; emptyText?: string }) {
  const empty = !has(report.diagnosis) && !has(report.notes) && !has(report.dietInstructions) && !has(report.lifestyleAdvice);
  return (
    <div className="space-y-4">
      {empty ? (
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <ClipboardList className="h-4 w-4" /> {emptyText || 'The doctor has not written the summary yet.'}
        </p>
      ) : (
        <>
          <Section title="Assessment" body={report.diagnosis} />
          <Section title="Discussion & recommendations" body={report.notes} />
          <Section title="Diet (Pathya-Apathya)" body={report.dietInstructions} />
          <Section title="Lifestyle & routine" body={report.lifestyleAdvice} />
        </>
      )}
    </div>
  );
}

/** Report 2: medicines prescribed. */
export function PrescriptionReport({ report, emptyText }: { report: Report; emptyText?: string }) {
  if (report.medicines.length === 0) {
    return (
      <p className="flex items-center gap-2 text-sm text-ink-muted">
        <Pill className="h-4 w-4" /> {emptyText || 'No medicines have been prescribed yet.'}
      </p>
    );
  }
  return (
    <ol className="space-y-3">
      {report.medicines.map((m, i) => (
        <li key={`${m.name}-${i}`} className="rounded-2xl border border-line bg-white p-4 break-inside-avoid">
          <p className="font-semibold text-ink">
            {i + 1}. {m.name}
          </p>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-3">
            {[
              ['Dose', m.dosage],
              ['When', m.frequency],
              ['Timing', m.timing],
              ['Take with', m.anupana],
              ['Duration', m.duration],
            ]
              .filter(([, v]) => has(v))
              .map(([k, v]) => (
                <div key={k}>
                  <dt className="text-[11px] uppercase tracking-wide text-ink-muted">{k}</dt>
                  <dd className="text-ink">{v}</dd>
                </div>
              ))}
          </dl>
          {has(m.notes) && <p className="mt-2 text-sm text-ink-muted">{m.notes}</p>}
        </li>
      ))}
    </ol>
  );
}
