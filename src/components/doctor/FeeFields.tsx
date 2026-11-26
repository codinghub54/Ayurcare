'use client';

import React from 'react';
import { Video, Phone, MessageSquare } from 'lucide-react';

export type FeeType = 'VIDEO' | 'AUDIO' | 'CHAT';
export type FeeFormState = Record<FeeType, { offered: boolean; amount: string }>;

const ROWS: { type: FeeType; label: string; hint: string; icon: typeof Video }[] = [
  { type: 'VIDEO', label: 'Video consultation', hint: 'Face-to-face in the video room', icon: Video },
  { type: 'AUDIO', label: 'Audio consultation', hint: 'Voice call', icon: Phone },
  { type: 'CHAT', label: 'Chat consultation', hint: 'Text chat', icon: MessageSquare },
];

export function emptyFeeState(): FeeFormState {
  return {
    VIDEO: { offered: true, amount: '' },
    AUDIO: { offered: true, amount: '' },
    CHAT: { offered: true, amount: '' },
  };
}

/** Build form state from saved fees (null = not offered). */
export function feeStateFrom(fees: Partial<Record<FeeType, number | null>> | null | undefined): FeeFormState {
  const s = emptyFeeState();
  if (!fees) return s;
  (Object.keys(s) as FeeType[]).forEach((t) => {
    const v = fees[t];
    s[t] = v === null || v === undefined ? { offered: false, amount: '' } : { offered: true, amount: String(v) };
  });
  return s;
}

/** Convert form state to the API payload, or return a readable error. */
export function feePayload(state: FeeFormState): { fees: Record<FeeType, number | null> } | { error: string } {
  const out = {} as Record<FeeType, number | null>;
  for (const row of ROWS) {
    const { offered, amount } = state[row.type];
    if (!offered) {
      out[row.type] = null;
      continue;
    }
    const n = Number(amount);
    if (amount.trim() === '' || !Number.isFinite(n) || n < 0) {
      return { error: `Please enter a fee for ${row.label.toLowerCase()}, or switch it off.` };
    }
    out[row.type] = n;
  }
  if (Object.values(out).every((v) => v === null)) {
    return { error: 'Please offer at least one consultation type.' };
  }
  return { fees: out };
}

interface Props {
  value: FeeFormState;
  onChange: (next: FeeFormState) => void;
  tone?: 'light' | 'dark';
}

export default function FeeFields({ value, onChange, tone = 'light' }: Props) {
  const dark = tone === 'dark';
  const set = (type: FeeType, patch: Partial<{ offered: boolean; amount: string }>) =>
    onChange({ ...value, [type]: { ...value[type], ...patch } });

  return (
    <div className="space-y-2.5">
      {ROWS.map((row) => {
        const v = value[row.type];
        const Icon = row.icon;
        return (
          <div
            key={row.type}
            className={`flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3 transition ${
              dark
                ? v.offered
                  ? 'border-slate-700 bg-slate-900'
                  : 'border-slate-800 bg-slate-950 opacity-60'
                : v.offered
                  ? 'border-line bg-white'
                  : 'border-line bg-bg opacity-70'
            }`}
          >
            <label className="flex flex-1 min-w-[180px] cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                checked={v.offered}
                onChange={(e) => set(row.type, { offered: e.target.checked })}
                className="h-4 w-4 accent-[#1E5A43] cursor-pointer"
              />
              <Icon className={`h-4 w-4 ${dark ? 'text-emerald-400' : 'text-forest'}`} />
              <span>
                <span className={`block text-sm font-semibold ${dark ? 'text-slate-100' : 'text-ink'}`}>{row.label}</span>
                <span className={`block text-xs ${dark ? 'text-slate-400' : 'text-ink-muted'}`}>{v.offered ? row.hint : 'Not offered'}</span>
              </span>
            </label>
            <div className="relative w-36">
              <span className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm ${dark ? 'text-slate-400' : 'text-ink-muted'}`}>₹</span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="1"
                disabled={!v.offered}
                value={v.amount}
                onChange={(e) => set(row.type, { amount: e.target.value })}
                aria-label={`${row.label} fee in rupees`}
                placeholder="Fee"
                className={`w-full rounded-xl border py-2 pl-7 pr-3 text-sm focus:outline-none focus:ring-4 disabled:cursor-not-allowed ${
                  dark
                    ? 'border-slate-700 bg-slate-950 text-slate-100 focus:border-emerald-500 focus:ring-emerald-500/10'
                    : 'border-line bg-white text-ink focus:border-forest focus:ring-forest/10'
                }`}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
