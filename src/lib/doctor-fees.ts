/**
 * Per-consultation-type fees chosen by each doctor.
 *
 * Stored inside DoctorProfile.availability (a JSON string) under the `fees`
 * key, next to the weekly `recurring` schedule. This needs no database
 * migration. A null fee means the doctor does not offer that type.
 *
 * Older profiles have no `fees` key: every type then falls back to the
 * single legacy feePerConsult, which is also kept in sync with the lowest
 * offered fee so existing reports keep working.
 */

export const CONSULT_TYPES = ['VIDEO', 'AUDIO', 'CHAT'] as const;
export type ConsultType = (typeof CONSULT_TYPES)[number];
export type ConsultFees = Record<ConsultType, number | null>;

export const CONSULT_TYPE_LABELS: Record<ConsultType, string> = {
  VIDEO: 'Video',
  AUDIO: 'Audio',
  CHAT: 'Chat',
};

export const MIN_FEE = 0;
export const MAX_FEE = 100000;

export function parseAvailability(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/** Fees for each type, falling back to the legacy single fee. */
export function getConsultFees(profile: { feePerConsult?: number | null; availability?: string | null }): ConsultFees {
  const legacy = typeof profile.feePerConsult === 'number' ? profile.feePerConsult : null;
  const stored = parseAvailability(profile.availability).fees as Partial<Record<ConsultType, unknown>> | undefined;
  if (!stored || typeof stored !== 'object') {
    return { VIDEO: legacy, AUDIO: legacy, CHAT: legacy };
  }
  const read = (t: ConsultType): number | null => {
    const v = stored[t];
    return typeof v === 'number' && Number.isFinite(v) && v >= MIN_FEE ? v : null;
  };
  return { VIDEO: read('VIDEO'), AUDIO: read('AUDIO'), CHAT: read('CHAT') };
}

/** Lowest fee among offered types (for "from ₹X" and the legacy column). */
export function lowestFee(fees: ConsultFees): number | null {
  const offered = CONSULT_TYPES.map((t) => fees[t]).filter((v): v is number => v !== null);
  return offered.length ? Math.min(...offered) : null;
}

/**
 * Validate fees sent by a form. Accepts numbers, numeric strings, or null/''
 * for "not offered". Returns an error message or the cleaned fees.
 */
export function validateFees(input: unknown): { fees: ConsultFees } | { error: string } {
  if (!input || typeof input !== 'object') return { error: 'Please set your consultation fees.' };
  const src = input as Record<string, unknown>;
  const out = {} as ConsultFees;
  for (const t of CONSULT_TYPES) {
    const raw = src[t];
    if (raw === null || raw === undefined || raw === '' || raw === false) {
      out[t] = null;
      continue;
    }
    const n = typeof raw === 'number' ? raw : Number(String(raw).trim());
    if (!Number.isFinite(n) || n < MIN_FEE || n > MAX_FEE) {
      return { error: `${CONSULT_TYPE_LABELS[t]} fee must be between ₹${MIN_FEE} and ₹${MAX_FEE.toLocaleString('en-IN')}.` };
    }
    out[t] = Math.round(n * 100) / 100;
  }
  if (CONSULT_TYPES.every((t) => out[t] === null)) {
    return { error: 'Please offer at least one consultation type (video, audio or chat).' };
  }
  return { fees: out };
}

/** Write fees into the availability JSON, keeping the weekly schedule intact. */
export function availabilityWithFees(raw: string | null | undefined, fees: ConsultFees): string {
  return JSON.stringify({ ...parseAvailability(raw), fees });
}

/** Write a new weekly schedule, keeping any saved fees intact. */
export function availabilityWithSchedule(raw: string | null | undefined, schedule: Record<string, unknown>): string {
  const current = parseAvailability(raw);
  return JSON.stringify({ ...schedule, ...(current.fees ? { fees: current.fees } : {}) });
}
