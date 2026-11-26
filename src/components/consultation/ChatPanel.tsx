'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ArrowUp, Info } from 'lucide-react';
import type { ChatMessage } from './useConsultationRoom';

interface Props {
  messages: ChatMessage[];
  myId: string;
  peerName: string;
  canSend: boolean;
  closedReason?: string;
  onSend: (body: string) => Promise<{ ok: boolean; error?: string }>;
  className?: string;
}

export default function ChatPanel({ messages, myId, peerName, canSend, closedReason, onSend, className = '' }: Props) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length]);

  const submit = async () => {
    const body = text.trim();
    if (!body) return;
    setText('');
    setError('');
    const res = await onSend(body);
    if (!res.ok) {
      setError(res.error || 'Message could not be sent.');
      setText(body);
    }
  };

  return (
    <div className={`flex min-h-0 flex-col rounded-3xl border border-line bg-white ${className}`}>
      <div className="border-b border-line px-5 py-3.5">
        <p className="text-sm font-semibold text-ink">Chat with {peerName}</p>
        <p className="text-xs text-ink-muted">Messages are saved with this consultation.</p>
      </div>

      <div ref={listRef} className="min-h-[200px] flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 && <p className="py-8 text-center text-sm text-ink-muted">No messages yet.</p>}
        {messages.map((m) => {
          if (m.senderRole === 'SYSTEM') {
            return (
              <p key={m.id} className="mx-auto flex max-w-[90%] items-start gap-1.5 rounded-xl bg-sage/70 px-3 py-2 text-center text-xs text-forest">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {m.body}
              </p>
            );
          }
          const mine = m.senderId === myId;
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm ${
                  mine ? 'rounded-br-md bg-forest text-white' : 'rounded-bl-md bg-bg text-ink'
                } ${m.pending ? 'opacity-60' : ''}`}
              >
                {m.body}
                <span className={`mt-0.5 block text-[10px] ${mine ? 'text-white/60' : 'text-ink-muted'}`}>
                  {new Date(m.createdAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {error && <p className="px-4 pb-2 text-xs text-red-600">{error}</p>}
      {canSend ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="flex items-end gap-2 border-t border-line p-3"
        >
          <label htmlFor="consult-chat" className="sr-only">Message</label>
          <textarea
            id="consult-chat"
            rows={1}
            value={text}
            maxLength={2000}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Type a message…"
            className="max-h-28 min-h-[42px] flex-1 resize-none rounded-2xl border border-line px-3.5 py-2.5 text-sm text-ink focus:border-forest focus:outline-none focus:ring-4 focus:ring-forest/10"
          />
          <button
            type="submit"
            disabled={!text.trim()}
            aria-label="Send message"
            className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-2xl bg-forest text-white transition hover:bg-forest-deep disabled:opacity-40 cursor-pointer"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        </form>
      ) : (
        <p className="border-t border-line px-4 py-3 text-center text-xs text-ink-muted">{closedReason || 'Chat is closed.'}</p>
      )}
    </div>
  );
}
