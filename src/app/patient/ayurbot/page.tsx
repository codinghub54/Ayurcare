'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowUp, Loader2, RotateCcw, Leaf, AlertTriangle, CalendarPlus } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

interface Msg {
  role: 'user' | 'assistant';
  content: string;
  emergency?: boolean;
}

const STORAGE_PREFIX = 'ayurbot-conversation-';

const STARTERS = [
  'What is my Prakriti and how should I eat for it?',
  'Explain Vata, Pitta and Kapha in simple terms',
  'Give me a simple Ayurvedic morning routine (Dinacharya)',
  'What is Triphala used for, and who should avoid it?',
  'How should I adjust my diet for the monsoon?',
  'What is Agni and how can I support my digestion?',
];

/* ---------- tiny, safe markdown renderer (no HTML injection) ---------- */
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.map((part, i) => {
    if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={`${keyPrefix}-${i}`} className="font-semibold text-ink">{part.slice(2, -2)}</strong>;
    if (/^\*[^*]+\*$/.test(part)) return <em key={`${keyPrefix}-${i}`}>{part.slice(1, -1)}</em>;
    return <React.Fragment key={`${keyPrefix}-${i}`}>{part}</React.Fragment>;
  });
}

function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r/g, '').split('\n');
  const blocks: React.ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flush = () => {
    if (!list) return;
    const Tag = list.ordered ? 'ol' : 'ul';
    blocks.push(
      <Tag key={`l-${blocks.length}`} className={`${list.ordered ? 'list-decimal' : 'list-disc'} space-y-1 pl-5`}>
        {list.items.map((it, i) => (
          <li key={i}>{renderInline(it, `li-${blocks.length}-${i}`)}</li>
        ))}
      </Tag>
    );
    list = null;
  };

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    const bullet = trimmed.match(/^[-*•]\s+(.*)$/);
    const numbered = trimmed.match(/^\d+[.)]\s+(.*)$/);
    if (bullet || numbered) {
      const ordered = !!numbered;
      if (!list || list.ordered !== ordered) {
        flush();
        list = { ordered, items: [] };
      }
      list.items.push((bullet || numbered)![1]);
      return;
    }
    flush();
    if (!trimmed) return;
    if (/^-{3,}$|^\*{3,}$/.test(trimmed)) {
      blocks.push(<hr key={`hr-${idx}`} className="border-line" />);
      return;
    }
    const heading = trimmed.match(/^#{1,4}\s+(.*)$/);
    if (heading) {
      blocks.push(
        <p key={`h-${idx}`} className="pt-1 font-semibold text-ink">
          {renderInline(heading[1], `h-${idx}`)}
        </p>
      );
      return;
    }
    blocks.push(<p key={`p-${idx}`}>{renderInline(trimmed, `p-${idx}`)}</p>);
  });
  flush();
  return <div className="space-y-2.5">{blocks}</div>;
}

function BotAvatar({ size = 'h-9 w-9' }: { size?: string }) {
  return (
    <span className={`flex ${size} shrink-0 items-center justify-center rounded-xl bg-forest text-white shadow-sm`}>
      <Leaf className="h-[55%] w-[55%]" />
    </span>
  );
}

export default function AyurBotPage() {
  const { user } = useAuth();
  // Scope saved chats to the signed-in user so a shared browser never shows someone else's chat.
  // The conversation is kept for this browser tab only (cleared when the tab closes).
  const storageKey = `${STORAGE_PREFIX}${user?.id ?? 'anon'}`;
  const [messages, setMessages] = useState<Msg[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const parsed = JSON.parse(sessionStorage.getItem(storageKey) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(messages));
    } catch {
      /* ignore */
    }
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending, storageKey]);

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || sending) return;
    setError('');
    const next: Msg[] = [...messages, { role: 'user', content }];
    setMessages(next);
    setInput('');
    setSending(true);
    try {
      const res = await fetch('/api/patient/ayurbot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next.map(({ role, content }) => ({ role, content })) }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.reply) {
        setMessages((m) => [...m, { role: 'assistant', content: data.reply, emergency: !!data.emergency }]);
      } else {
        setError(data.error || 'AyurBot could not answer right now. Please try again.');
      }
    } catch {
      setError('Could not reach AyurBot. Check your connection and try again.');
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const reset = () => {
    setMessages([]);
    setError('');
    sessionStorage.removeItem(storageKey);
    inputRef.current?.focus();
  };

  const firstName = user?.name?.split(' ')[0];

  return (
    <div className="mx-auto flex h-[calc(100dvh-7.5rem)] max-w-4xl flex-col lg:h-[calc(100dvh-5rem)]" id="ayurbot-page">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 pb-4">
        <div className="flex items-center gap-3">
          <BotAvatar size="h-11 w-11" />
          <div>
            <h1 className="font-display text-2xl font-semibold text-ink">AyurBot</h1>
            <p className="text-sm text-ink-muted">Your Ayurveda knowledge assistant</p>
          </div>
        </div>
        {messages.length > 0 && (
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-4 py-2 text-sm font-medium text-ink-muted transition hover:text-ink cursor-pointer"
          >
            <RotateCcw className="h-4 w-4" /> New chat
          </button>
        )}
      </div>

      {/* Conversation */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto rounded-3xl border border-line bg-white">
        {messages.length === 0 ? (
          <div className="flex min-h-full flex-col items-center justify-center px-6 py-10 text-center">
            <BotAvatar size="h-14 w-14" />
            <h2 className="mt-5 font-display text-2xl font-semibold text-ink">
              Namaste{firstName ? `, ${firstName}` : ''}. What would you like to know?
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-muted">
              Ask about doshas, herbs, diet, daily routines, yoga or any Ayurvedic concept. AyurBot uses your saved
              Prakriti to personalise answers.
            </p>
            <div className="mt-8 grid w-full max-w-2xl gap-2.5 sm:grid-cols-2">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-2xl border border-line bg-bg px-4 py-3 text-left text-sm text-ink transition hover:border-forest/40 hover:bg-sage/50 cursor-pointer"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-6 p-5 sm:p-7">
            {messages.map((m, i) =>
              m.role === 'user' ? (
                <div key={i} className="flex justify-end">
                  <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-forest px-4 py-3 text-[15px] leading-relaxed text-white">
                    {m.content}
                  </div>
                </div>
              ) : (
                <div key={i} className="flex gap-3">
                  <BotAvatar />
                  <div
                    className={`min-w-0 max-w-[85%] rounded-2xl rounded-tl-md px-4 py-3 text-[15px] leading-relaxed text-ink/90 ${
                      m.emergency ? 'border border-red-200 bg-red-50' : 'bg-bg'
                    }`}
                  >
                    {m.emergency && (
                      <p className="mb-2 flex items-center gap-2 font-semibold text-red-700">
                        <AlertTriangle className="h-4 w-4" /> Seek urgent care
                      </p>
                    )}
                    <Markdown text={m.content} />
                  </div>
                </div>
              )
            )}
            {sending && (
              <div className="flex gap-3">
                <BotAvatar />
                <div className="flex items-center gap-2 rounded-2xl rounded-tl-md bg-bg px-4 py-3 text-sm text-ink-muted">
                  <Loader2 className="h-4 w-4 animate-spin" /> AyurBot is thinking…
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {error && (
        <div role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Composer */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="mt-3 flex items-end gap-2 rounded-3xl border border-line bg-white p-2 pl-4 focus-within:border-forest focus-within:ring-4 focus-within:ring-forest/10"
      >
        <label htmlFor="ayurbot-input" className="sr-only">
          Message AyurBot
        </label>
        <textarea
          id="ayurbot-input"
          ref={inputRef}
          rows={1}
          value={input}
          maxLength={2000}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          placeholder="Ask AyurBot about herbs, doshas, diet…"
          className="max-h-40 min-h-[44px] flex-1 resize-none bg-transparent py-2.5 text-[15px] text-ink placeholder:text-ink-muted/60 focus:outline-none"
        />
        <button
          type="submit"
          disabled={!input.trim() || sending}
          aria-label="Send message"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-forest text-white transition hover:bg-forest-deep disabled:opacity-40 cursor-pointer"
        >
          {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowUp className="h-5 w-5" />}
        </button>
      </form>
      <p className="mt-2 flex flex-wrap items-center justify-center gap-x-1 text-center text-xs text-ink-muted">
        AyurBot gives general Ayurvedic education, not medical advice. For symptoms,
        <Link href="/patient/doctors" className="inline-flex items-center gap-1 font-semibold text-forest hover:underline">
          <CalendarPlus className="h-3 w-3" /> book a physician
        </Link>
        .
      </p>
    </div>
  );
}
