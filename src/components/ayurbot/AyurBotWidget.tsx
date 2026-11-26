'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowUp,
  Loader2,
  X,
  Leaf,
  RotateCcw,
  AlertTriangle,
  CalendarPlus,
  ArrowRight,
  Stethoscope,
  ClipboardList,
  CalendarClock,
  Sun,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import Markdown from './Markdown';

type Action =
  | { type: 'start_booking'; doctorId: string; doctorName: string; fee: number | null; date?: string; time?: string; consultType?: string; href: string }
  | { type: 'open_page'; page: string; label: string; href: string };

interface Msg {
  role: 'user' | 'assistant';
  content: string;
  actions?: Action[];
  emergency?: boolean;
}

/** Open the widget from anywhere: window.dispatchEvent(new CustomEvent('ayurbot:open', { detail: { prompt } })) */
export const AYURBOT_OPEN_EVENT = 'ayurbot:open';

const QUICK = [
  { icon: Stethoscope, label: 'Book a consultation', prompt: 'Help me book a consultation with an Ayurvedic doctor.' },
  { icon: ClipboardList, label: 'My Prakriti', prompt: 'What is my Prakriti and what does it mean for me?' },
  { icon: CalendarClock, label: 'My appointments', prompt: 'Show my upcoming appointments.' },
  { icon: Sun, label: 'Daily routine', prompt: 'Suggest a simple Ayurvedic daily routine (Dinacharya) for my dosha.' },
];

function Avatar({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <span className={`flex ${className} shrink-0 items-center justify-center rounded-xl bg-forest text-white`}>
      <Leaf className="h-[55%] w-[55%]" />
    </span>
  );
}

function formatDate(date?: string, time?: string) {
  if (!date) return null;
  const d = new Date(`${date}T${time || '00:00'}:00`);
  const day = d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  return time ? `${day}, ${time}` : day;
}

function ActionCard({ action, onNavigate }: { action: Action; onNavigate: () => void }) {
  if (action.type === 'start_booking') {
    const when = formatDate(action.date, action.time);
    return (
      <div className="mt-3 rounded-2xl border border-forest/20 bg-white p-4 shadow-sm">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-forest">Ready to book</p>
        <p className="mt-1.5 font-semibold text-ink">{action.doctorName}</p>
        <p className="mt-0.5 text-sm text-ink-muted">
          {[when, action.consultType ? action.consultType.toLowerCase() + ' consultation' : null, action.fee != null ? `₹${action.fee.toLocaleString('en-IN')}` : null]
            .filter(Boolean)
            .join(' · ')}
        </p>
        <Link
          href={action.href}
          onClick={onNavigate}
          className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-forest py-2.5 text-sm font-semibold text-white transition hover:bg-forest-deep"
        >
          <CalendarPlus className="h-4 w-4" /> Continue to booking
        </Link>
        <p className="mt-2 text-center text-[11px] text-ink-muted">You&apos;ll review and pay on the next screen.</p>
      </div>
    );
  }
  return (
    <Link
      href={action.href}
      onClick={onNavigate}
      className="mt-3 inline-flex items-center gap-2 rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-forest shadow-sm transition hover:border-forest/40"
    >
      Open {action.label} <ArrowRight className="h-3.5 w-3.5" />
    </Link>
  );
}

export default function AyurBotWidget() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const pendingPrompt = useRef<string | null>(null);

  const firstName = user?.name?.split(' ')[0];

  // Load the most recent conversation the first time the panel opens
  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/patient/ayurbot');
      if (res.ok) {
        const data = await res.json();
        setSessionId(data.sessionId);
        setMessages(Array.isArray(data.messages) ? data.messages : []);
      }
    } catch {
      /* start empty */
    } finally {
      setLoaded(true);
    }
  }, []);

  const send = useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!content || sending) return;
      setError('');
      setMessages((m) => [...m, { role: 'user', content }]);
      setInput('');
      setSending(true);
      try {
        const res = await fetch('/api/patient/ayurbot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, message: content }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.reply) {
          setSessionId(data.sessionId);
          setMessages((m) => [...m, data.reply]);
        } else {
          setError(data.error || 'AyurBot could not answer right now. Please try again.');
        }
      } catch {
        setError('Could not reach AyurBot. Check your connection and try again.');
      } finally {
        setSending(false);
        inputRef.current?.focus();
      }
    },
    [sending, sessionId]
  );

  const openPanel = useCallback(
    (prompt?: string) => {
      setOpen(true);
      if (prompt) pendingPrompt.current = prompt;
      if (!loaded) loadHistory();
    },
    [loaded, loadHistory]
  );

  // Send a prompt handed over by another part of the app once history has loaded
  useEffect(() => {
    if (open && loaded && pendingPrompt.current && !sending) {
      const p = pendingPrompt.current;
      pendingPrompt.current = null;
      send(p);
    }
  }, [open, loaded, sending, send]);

  // Open from other components and from ?ayurbot=<prompt> links
  useEffect(() => {
    const onOpen = (e: Event) => openPanel((e as CustomEvent<{ prompt?: string }>).detail?.prompt);
    window.addEventListener(AYURBOT_OPEN_EVENT, onOpen);

    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('ayurbot');
    if (fromUrl !== null) {
      params.delete('ayurbot');
      const qs = params.toString();
      window.history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : ''));
      // Opening from a link is a one-time sync with the URL (an external system)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      openPanel(fromUrl || undefined);
    }
    return () => window.removeEventListener(AYURBOT_OPEN_EVENT, onOpen);
  }, [openPanel]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending, open]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const newChat = () => {
    setMessages([]);
    setSessionId(null);
    setError('');
    inputRef.current?.focus();
  };

  return (
    <>
      {/* Launcher - bottom-left of the content area (clears the desktop sidebar) */}
      {!open && (
        <button
          onClick={() => openPanel()}
          className="group fixed bottom-5 left-4 z-40 flex items-center gap-2.5 rounded-full bg-ink py-2 pl-2 pr-5 text-sm font-semibold text-white shadow-[0_16px_40px_-12px_rgba(18,58,43,0.7)] transition hover:-translate-y-0.5 hover:bg-forest-deep lg:left-[288px] cursor-pointer"
          aria-label="Open AyurBot"
        >
          <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-forest to-saffron">
            <Leaf className="h-4.5 w-4.5" />
            <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-ink bg-emerald-400" />
          </span>
          Ask AyurBot
        </button>
      )}

      {/* Panel */}
      {open && (
        <div
          role="dialog"
          aria-label="AyurBot"
          className="fixed inset-x-3 bottom-3 top-16 z-50 flex animate-slideUp flex-col overflow-hidden rounded-[28px] border border-white/60 bg-bg shadow-[0_30px_80px_-20px_rgba(18,38,30,0.45)] sm:inset-x-auto sm:left-4 sm:top-auto sm:h-[min(640px,calc(100dvh-2.5rem))] sm:w-[420px] lg:left-[288px]"
        >
          {/* Soft gradient wash, like a sunrise over the leaf */}
          <div className="pointer-events-none absolute inset-0" aria-hidden="true">
            <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-forest/25 blur-3xl" />
            <div className="absolute -right-20 top-10 h-64 w-64 rounded-full bg-saffron/30 blur-3xl" />
            <div className="absolute left-1/3 top-40 h-56 w-56 rounded-full bg-[#E9B8C9]/40 blur-3xl" />
          </div>

          {/* Header */}
          <div className="relative flex items-center justify-between px-4 pt-4">
            <div className="flex items-center gap-2.5">
              <Avatar className="h-9 w-9" />
              <div className="leading-tight">
                <p className="font-display text-lg font-semibold text-ink">AyurBot</p>
                <p className="text-[11px] text-ink-muted">Ayurveda &amp; AyurCare assistant</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <button onClick={newChat} className="rounded-full p-2 text-ink-muted transition hover:bg-white/70 hover:text-ink cursor-pointer" aria-label="New chat" title="New chat">
                  <RotateCcw className="h-4 w-4" />
                </button>
              )}
              <button onClick={() => setOpen(false)} className="rounded-full p-2 text-ink-muted transition hover:bg-white/70 hover:text-ink cursor-pointer" aria-label="Close AyurBot">
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div ref={scrollRef} className="relative flex-1 overflow-y-auto px-4 pb-2 pt-4">
            {!loaded ? (
              <div className="flex h-full items-center justify-center text-sm text-ink-muted">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : messages.length === 0 ? (
              <div className="flex min-h-full flex-col items-center justify-center pb-6 text-center">
                <h2 className="font-display text-[1.75rem] font-semibold leading-tight text-ink">
                  Namaste{firstName ? `, ${firstName}` : ''}
                </h2>
                <p className="mt-2 max-w-[300px] text-sm text-ink-muted">
                  Ask me anything about Ayurveda, or let me find a doctor and set up your booking.
                </p>
                <div className="mt-6 grid w-full grid-cols-2 gap-2">
                  {QUICK.map((q) => (
                    <button
                      key={q.label}
                      onClick={() => send(q.prompt)}
                      className="flex items-center gap-2 rounded-2xl border border-white/80 bg-white/70 px-3 py-2.5 text-left text-[13px] font-medium text-ink backdrop-blur transition hover:bg-white cursor-pointer"
                    >
                      <q.icon className="h-4 w-4 shrink-0 text-forest" /> {q.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((m, i) =>
                  m.role === 'user' ? (
                    <div key={i} className="flex justify-end">
                      <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-forest px-3.5 py-2.5 text-sm leading-relaxed text-white">
                        {m.content}
                      </div>
                    </div>
                  ) : (
                    <div key={i} className="flex gap-2.5">
                      <Avatar className="h-7 w-7" />
                      <div className="min-w-0 max-w-[88%]">
                        <div
                          className={`rounded-2xl rounded-tl-md px-3.5 py-2.5 text-sm leading-relaxed text-ink/90 backdrop-blur ${
                            m.emergency ? 'border border-red-200 bg-red-50' : 'bg-white/85'
                          }`}
                        >
                          {m.emergency && (
                            <p className="mb-1.5 flex items-center gap-1.5 font-semibold text-red-700">
                              <AlertTriangle className="h-4 w-4" /> Seek urgent care
                            </p>
                          )}
                          <Markdown text={m.content} />
                        </div>
                        {m.actions?.map((a, j) => (
                          <ActionCard key={j} action={a} onNavigate={() => setOpen(false)} />
                        ))}
                      </div>
                    </div>
                  )
                )}
                {sending && (
                  <div className="flex gap-2.5">
                    <Avatar className="h-7 w-7" />
                    <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-md bg-white/85 px-3.5 py-3">
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-forest/60" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-forest/60 [animation-delay:0.15s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-forest/60 [animation-delay:0.3s]" />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {error && (
            <div role="alert" className="relative mx-4 mb-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}

          {/* Composer */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="relative mx-3 mb-3 rounded-[22px] border border-white bg-white/90 p-2.5 shadow-[0_8px_30px_-12px_rgba(18,38,30,0.35)] backdrop-blur focus-within:ring-4 focus-within:ring-forest/10"
          >
            <label htmlFor="ayurbot-input" className="sr-only">Message AyurBot</label>
            <textarea
              id="ayurbot-input"
              ref={inputRef}
              rows={2}
              value={input}
              maxLength={2000}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              placeholder="Ask AyurBot about herbs, doshas, or booking a doctor…"
              className="block max-h-32 w-full resize-none bg-transparent px-1.5 text-sm text-ink placeholder:text-ink-muted/70 focus:outline-none focus-visible:outline-none"
            />
            <div className="mt-1.5 flex items-center justify-between">
              <button
                type="button"
                onClick={() => send('Help me book a consultation with an Ayurvedic doctor.')}
                disabled={sending}
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium text-ink-muted transition hover:bg-bg hover:text-ink disabled:opacity-50 cursor-pointer"
              >
                <CalendarPlus className="h-3.5 w-3.5" /> Book
              </button>
              <button
                type="submit"
                disabled={!input.trim() || sending}
                aria-label="Send"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-white transition hover:bg-forest-deep disabled:opacity-30 cursor-pointer"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
              </button>
            </div>
          </form>
          <p className="relative -mt-1 mb-2.5 px-4 text-center text-[10.5px] text-ink-muted">
            General Ayurvedic guidance, not a diagnosis. In an emergency call 112.
          </p>
        </div>
      )}
    </>
  );
}
