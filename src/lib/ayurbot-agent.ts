/**
 * AyurBot agent: an Ayurveda-only assistant that can look things up in AyurCare
 * (doctors, open slots, the patient's appointments and Prakriti) and propose
 * actions (start a booking, open a page) that the patient confirms in the UI.
 *
 * Read-only tools run on the server. Tools with side effects never run here:
 * they become "action cards" the patient must click, so nothing is booked or
 * paid for without the patient's own confirmation.
 */
import { prisma } from '@/lib/db';
import { PENDING_HOLD_MINUTES } from '@/lib/booking';

export type ChatTurn = { role: 'user' | 'assistant'; content: string };

export type AyurBotAction =
  | {
      type: 'start_booking';
      doctorId: string;
      doctorName: string;
      fee: number | null;
      date?: string;
      time?: string;
      consultType?: 'VIDEO' | 'AUDIO' | 'CHAT';
      href: string;
    }
  | { type: 'open_page'; page: string; label: string; href: string };

export const PAGES: Record<string, { label: string; href: string }> = {
  dashboard: { label: 'Dashboard', href: '/patient/dashboard' },
  doctors: { label: 'Book a consultation', href: '/patient/doctors' },
  records: { label: 'Medical records', href: '/patient/records' },
  report_analyser: { label: 'Report analyser', href: '/patient/analyzer' },
  prakriti_quiz: { label: 'Prakriti quiz', href: '/patient/quiz' },
  profile: { label: 'My profile', href: '/patient/profile' },
  yoga: { label: 'Yoga guide', href: '/patient/yoga' },
  meditation: { label: 'Meditation', href: '/patient/meditation' },
  breathing: { label: 'Breathing exercises', href: '/patient/breathing' },
  diet: { label: 'Ayurvedic diet', href: '/patient/diet' },
  herbs: { label: 'Herb directory', href: '/patient/remedies' },
  home_remedies: { label: 'Home remedies', href: '/patient/home-remedies' },
};

/* ------------------------------------------------------------------ */
/* Tool definitions (JSON schema, OpenAI style)                        */
/* ------------------------------------------------------------------ */

type JsonSchema = { type: string; description?: string; properties?: Record<string, JsonSchema>; required?: string[]; enum?: string[]; items?: JsonSchema };
type ToolDef = { name: string; description: string; parameters: JsonSchema };

const TOOLS: ToolDef[] = [
  {
    name: 'find_doctors',
    description:
      'Search approved AyurCare Ayurvedic physicians. Use before suggesting a doctor. Optionally filter by a specialisation, condition or language keyword.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Keyword such as "Panchakarma", "skin", "women\'s health" or "Tamil". Leave empty for all.' },
      },
    },
  },
  {
    name: 'get_doctor_slots',
    description: 'Get open consultation time slots for a doctor on a date (YYYY-MM-DD, today or within the next 3 days).',
    parameters: {
      type: 'object',
      properties: {
        doctorId: { type: 'string', description: 'The doctor id returned by find_doctors.' },
        date: { type: 'string', description: 'Date in YYYY-MM-DD.' },
      },
      required: ['doctorId', 'date'],
    },
  },
  {
    name: 'get_my_appointments',
    description: "List the patient's upcoming and recent appointments.",
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'get_my_prakriti',
    description: "Get the patient's saved Prakriti (dosha type) and quiz scores.",
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'start_booking',
    description:
      'Show the patient a button that opens the booking screen with this doctor (and optionally date/time/type) pre-selected. The patient reviews, pays and confirms there. Use only after the patient has chosen a doctor.',
    parameters: {
      type: 'object',
      properties: {
        doctorId: { type: 'string' },
        date: { type: 'string', description: 'YYYY-MM-DD, optional' },
        time: { type: 'string', description: 'HH:MM 24-hour from get_doctor_slots, optional' },
        consultType: { type: 'string', enum: ['VIDEO', 'AUDIO', 'CHAT'] },
      },
      required: ['doctorId'],
    },
  },
  {
    name: 'open_page',
    description: 'Show the patient a button that opens a page in the AyurCare app.',
    parameters: {
      type: 'object',
      properties: { page: { type: 'string', enum: Object.keys(PAGES) } },
      required: ['page'],
    },
  },
];

/* ------------------------------------------------------------------ */
/* Tool implementations                                                */
/* ------------------------------------------------------------------ */

const DEFAULT_HOURS = ['09:00', '10:00', '11:00', '12:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00'];

function hoursFromAvailability(availability: string | null, date: Date): string[] {
  if (!availability) return DEFAULT_HOURS;
  try {
    const recurring = JSON.parse(availability)?.recurring || {};
    const weekday = date.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'Asia/Kolkata' });
    const ranges: string[] = recurring[weekday];
    if (!Array.isArray(ranges) || ranges.length === 0) return DEFAULT_HOURS;
    const out: string[] = [];
    for (const range of ranges) {
      const [start, end] = String(range).split('-');
      const s = parseInt(start, 10);
      const e = parseInt(end, 10);
      for (let h = s; h < e; h++) out.push(`${String(h).padStart(2, '0')}:00`);
    }
    return out;
  } catch {
    return DEFAULT_HOURS;
  }
}

function istDateString(d: Date) {
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // YYYY-MM-DD
}

async function findDoctors(query?: string) {
  const doctors = await prisma.user.findMany({
    where: { role: 'DOCTOR', status: 'ACTIVE', doctorProfile: { isApproved: true } },
    select: {
      id: true,
      name: true,
      doctorProfile: {
        select: { qualification: true, specializations: true, experienceYears: true, feePerConsult: true, languages: true, avgRating: true, bio: true },
      },
    },
    take: 50,
  });
  const q = (query || '').toLowerCase().trim();
  const list = doctors
    .filter((d) => {
      if (!q) return true;
      const p = d.doctorProfile;
      return [d.name, p?.specializations, p?.languages, p?.qualification, p?.bio].some((v) => v?.toLowerCase().includes(q));
    })
    .slice(0, 8)
    .map((d) => ({
      doctorId: d.id,
      name: d.name,
      qualification: d.doctorProfile?.qualification,
      specializations: d.doctorProfile?.specializations,
      languages: d.doctorProfile?.languages,
      experienceYears: d.doctorProfile?.experienceYears,
      feeInr: d.doctorProfile?.feePerConsult,
      rating: d.doctorProfile?.avgRating ? Number(d.doctorProfile.avgRating.toFixed(1)) : 'no ratings yet',
    }));
  return { count: list.length, doctors: list, note: list.length === 0 ? 'No approved doctors match. Offer to show all doctors.' : undefined };
}

export async function getDoctorSlots(doctorId: string, date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'Date must be YYYY-MM-DD.' };
  const today = istDateString(new Date());
  const maxDay = istDateString(new Date(Date.now() + 3 * 24 * 60 * 60 * 1000));
  if (date < today || date > maxDay) return { error: `Bookings are open from ${today} to ${maxDay}.` };

  const doctor = await prisma.doctorProfile.findFirst({
    where: { userId: doctorId, isApproved: true },
    select: { availability: true, feePerConsult: true, user: { select: { name: true } } },
  });
  if (!doctor) return { error: 'Doctor not found.' };

  const dayStart = new Date(`${date}T00:00:00+05:30`);
  const dayEnd = new Date(`${date}T23:59:59+05:30`);
  const booked = await prisma.appointment.findMany({
    where: {
      doctorId,
      scheduledAt: { gte: dayStart, lte: dayEnd },
      OR: [
        { status: 'CONFIRMED' },
        { status: 'PENDING', createdAt: { gte: new Date(Date.now() - PENDING_HOLD_MINUTES * 60 * 1000) } },
      ],
    },
    select: { scheduledAt: true },
  });
  const bookedTimes = new Set(
    booked.map((b) => b.scheduledAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }))
  );

  const nowIst = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
  const slots = hoursFromAvailability(doctor.availability, dayStart)
    .filter((t) => !bookedTimes.has(t))
    .filter((t) => date !== today || t > nowIst);

  return { doctorName: doctor.user.name, date, timezone: 'IST', feeInr: doctor.feePerConsult, openSlots: slots };
}

async function getMyAppointments(userId: string) {
  const appts = await prisma.appointment.findMany({
    where: { patientId: userId, scheduledAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
    orderBy: { scheduledAt: 'asc' },
    take: 10,
    select: { scheduledAt: true, status: true, type: true, doctor: { select: { user: { select: { name: true } } } } },
  });
  return {
    appointments: appts.map((a) => ({
      doctor: a.doctor.user.name,
      when: a.scheduledAt.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }),
      status: a.status,
      type: a.type,
      upcoming: a.scheduledAt > new Date(),
    })),
  };
}

async function getMyPrakriti(userId: string) {
  const profile = await prisma.patientProfile.findUnique({ where: { userId }, select: { doshaType: true, lifestyleData: true } });
  if (!profile?.doshaType) return { prakriti: null, note: 'The patient has not taken the Prakriti quiz yet. You can offer open_page prakriti_quiz.' };
  let scores;
  try {
    scores = JSON.parse(profile.lifestyleData || '{}')?.scores;
  } catch {}
  return { prakriti: profile.doshaType.replace(/_/g, '-'), quizScores: scores ?? null };
}

async function runTool(
  name: string,
  args: Record<string, unknown>,
  userId: string,
  actions: AyurBotAction[]
): Promise<unknown> {
  switch (name) {
    case 'find_doctors':
      return findDoctors(typeof args.query === 'string' ? args.query : undefined);
    case 'get_doctor_slots':
      return getDoctorSlots(String(args.doctorId || ''), String(args.date || ''));
    case 'get_my_appointments':
      return getMyAppointments(userId);
    case 'get_my_prakriti':
      return getMyPrakriti(userId);
    case 'start_booking': {
      const doctorId = String(args.doctorId || '');
      const doctor = await prisma.user.findFirst({
        where: { id: doctorId, role: 'DOCTOR', status: 'ACTIVE', doctorProfile: { isApproved: true } },
        select: { name: true, doctorProfile: { select: { feePerConsult: true } } },
      });
      if (!doctor) return { error: 'Doctor not found. Call find_doctors first.' };
      const date = typeof args.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(args.date) ? args.date : undefined;
      const time = typeof args.time === 'string' && /^\d{2}:\d{2}$/.test(args.time) ? args.time : undefined;
      const consultType = args.consultType === 'AUDIO' || args.consultType === 'CHAT' ? args.consultType : 'VIDEO';
      const params = new URLSearchParams({ doctor: doctorId, type: consultType });
      if (date) params.set('date', date);
      if (time) params.set('time', time);
      actions.push({
        type: 'start_booking',
        doctorId,
        doctorName: doctor.name,
        fee: doctor.doctorProfile?.feePerConsult ?? null,
        date,
        time,
        consultType,
        href: `/patient/doctors?${params.toString()}`,
      });
      return { status: 'A "Continue to booking" button is now shown to the patient. They confirm and pay on the booking screen.' };
    }
    case 'open_page': {
      const key = String(args.page || '');
      const page = PAGES[key];
      if (!page) return { error: 'Unknown page.' };
      if (!actions.some((a) => a.type === 'open_page' && a.page === key)) {
        actions.push({ type: 'open_page', page: key, label: page.label, href: page.href });
      }
      return { status: `A button to open "${page.label}" is now shown to the patient.` };
    }
    default:
      return { error: `Unknown tool ${name}` };
  }
}

/* ------------------------------------------------------------------ */
/* System prompt                                                       */
/* ------------------------------------------------------------------ */

export function buildSystemPrompt(patientName: string, doshaType: string | null) {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  return `You are AyurBot, the assistant inside AyurCare, an Ayurvedic telehealth platform in India. Today is ${today} (IST). You are talking to ${patientName}${
    doshaType ? `, whose saved Prakriti is ${doshaType.replace(/_/g, '-')}` : ', who has not saved a Prakriti yet'
  }.

Scope - you ONLY help with:
1. Ayurveda: doshas, Prakriti/Vikriti, Agni, Ama, herbs and classical formulations, Dinacharya, Ritucharya, Pathya-Apathya diet, yoga and pranayama.
2. Using AyurCare: finding an Ayurvedic physician, checking open slots, starting a booking, the patient's appointments and Prakriti, and opening app pages.
For anything else (coding, news, maths, general chit-chat, other medical systems in depth), politely say you can only help with Ayurveda and AyurCare.

Using tools:
- Never invent doctors, fees, slots, appointments or Prakriti. Always get them with tools.
- To book: find_doctors -> (optionally) get_doctor_slots -> start_booking. Confirm the doctor and time with the patient first if they have not chosen. Booking is completed and paid by the patient on the booking screen; never say it is booked.
- Use open_page when the patient wants to go somewhere in the app.
- Times are IST.

Safety:
- You are not a doctor. Do not diagnose, do not give personal doses for an illness, and never advise stopping prescribed medicine.
- For specific, severe or persistent symptoms, suggest booking an AyurCare physician (and offer to start it).
- Mention cautions for pregnancy, breastfeeding, children, chronic illness and herb-drug interactions where relevant.
- Distinguish traditional use from modern evidence; do not invent studies, numbers or verses.

Style: warm, concise, plain language, in the patient's language. Short paragraphs and bullet lists; **bold** key terms. Keep most replies under 150 words.`;
}

/* ------------------------------------------------------------------ */
/* Provider loops                                                      */
/* ------------------------------------------------------------------ */

function toGeminiSchema(s: JsonSchema): Record<string, unknown> {
  const out: Record<string, unknown> = { type: s.type.toUpperCase() };
  if (s.description) out.description = s.description;
  if (s.enum) out.enum = s.enum;
  if (s.required?.length) out.required = s.required;
  if (s.items) out.items = toGeminiSchema(s.items);
  if (s.properties) {
    const props = Object.entries(s.properties);
    if (props.length) out.properties = Object.fromEntries(props.map(([k, v]) => [k, toGeminiSchema(v)]));
  }
  return out;
}

const MAX_STEPS = 6;

async function runGemini(key: string, history: ChatTurn[], system: string, userId: string, actions: AyurBotAction[]) {
  const models = ['gemini-3.1-flash-lite', 'gemini-flash-lite-latest', 'gemini-flash-latest', 'gemini-2.0-flash'];
  const functionDeclarations = TOOLS.map((t) => {
    const params = toGeminiSchema(t.parameters);
    return params.properties ? { name: t.name, description: t.description, parameters: params } : { name: t.name, description: t.description };
  });

  for (const model of models) {
    const contents: Record<string, unknown>[] = history.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
    try {
      for (let step = 0; step < MAX_STEPS; step++) {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents,
            tools: [{ functionDeclarations }],
            generationConfig: { temperature: 0.5, maxOutputTokens: 900 },
          }),
        });
        if (!res.ok) throw new Error(`Gemini ${model} HTTP ${res.status}`);
        const json = await res.json();
        const content = json.candidates?.[0]?.content;
        const parts: { text?: string; functionCall?: { name: string; args?: Record<string, unknown> } }[] = content?.parts || [];
        const calls = parts.filter((p) => p.functionCall);
        if (calls.length === 0) {
          const text = parts.map((p) => p.text || '').join('').trim();
          if (text) return text;
          throw new Error(`Gemini ${model} returned no text`);
        }
        contents.push({ role: 'model', parts });
        const responses = [];
        for (const c of calls) {
          const result = await runTool(c.functionCall!.name, c.functionCall!.args || {}, userId, actions);
          responses.push({ functionResponse: { name: c.functionCall!.name, response: { result } } });
        }
        contents.push({ role: 'user', parts: responses });
      }
      return null;
    } catch (e) {
      console.warn('[ayurbot] gemini model failed', model, e);
      actions.length = 0; // discard partial actions before trying the next model
    }
  }
  return null;
}

async function runOpenAICompatible(
  url: string,
  key: string,
  model: string,
  history: ChatTurn[],
  system: string,
  userId: string,
  actions: AyurBotAction[]
) {
  const messages: Record<string, unknown>[] = [{ role: 'system', content: system }, ...history];
  const tools = TOOLS.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }));
  for (let step = 0; step < MAX_STEPS; step++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, messages, tools, temperature: 0.5, max_tokens: 900 }),
    });
    if (!res.ok) throw new Error(`${model} HTTP ${res.status}`);
    const json = await res.json();
    const msg = json.choices?.[0]?.message;
    const calls: { id: string; function: { name: string; arguments: string } }[] = msg?.tool_calls || [];
    if (!calls.length) return (msg?.content || '').trim() || null;
    messages.push({ role: 'assistant', content: msg.content ?? '', tool_calls: calls });
    for (const c of calls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(c.function.arguments || '{}');
      } catch {}
      const result = await runTool(c.function.name, args, userId, actions);
      messages.push({ role: 'tool', tool_call_id: c.id, content: JSON.stringify(result) });
    }
  }
  return null;
}

/** Run the agent. Returns null when no AI provider is configured or all fail. */
export async function runAyurBot(
  history: ChatTurn[],
  system: string,
  userId: string
): Promise<{ reply: string; actions: AyurBotAction[] } | null> {
  const actions: AyurBotAction[] = [];

  const gemini = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  if (gemini && gemini.length > 5 && !gemini.includes('mock')) {
    const text = await runGemini(gemini, history, system, userId, actions);
    if (text) return { reply: text, actions };
  }

  const others = [
    { key: process.env.GROQ_API_KEY, url: 'https://api.groq.com/openai/v1/chat/completions', model: 'llama-3.3-70b-versatile' },
    { key: process.env.OPENAI_API_KEY, url: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o-mini' },
  ];
  for (const p of others) {
    if (!p.key || p.key.length <= 5 || p.key.includes('mock')) continue;
    try {
      actions.length = 0;
      const text = await runOpenAICompatible(p.url, p.key, p.model, history, system, userId, actions);
      if (text) return { reply: text, actions };
    } catch (e) {
      console.warn('[ayurbot] provider failed', p.model, e);
    }
  }
  return null;
}
