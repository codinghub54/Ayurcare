'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Video, VideoOff, PhoneOff, Phone, Loader2, Wifi, AlertCircle, MessageSquare } from 'lucide-react';
import type { CallState, ConsultType } from './useConsultationRoom';

interface Props {
  type: ConsultType;
  peerName: string;
  peerRoleLabel: string;
  peer: { present: boolean; inCall: boolean };
  windowOpen: boolean;
  opensAt: string;
  active: boolean; // appointment confirmed (not completed/cancelled)
  call: {
    state: CallState;
    error: string;
    localStream: MediaStream | null;
    remoteStream: MediaStream | null;
    micOn: boolean;
    camOn: boolean;
    join: () => void;
    leave: () => void;
    toggleMic: () => void;
    toggleCam: () => void;
  };
}

function useAttach(ref: React.RefObject<HTMLVideoElement | HTMLAudioElement | null>, stream: MediaStream | null) {
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream;
  }, [ref, stream]);
}

function Timer({ running }: { running: boolean }) {
  const [start] = useState(() => Date.now());
  const [now, setNow] = useState(start);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);
  const s = Math.max(0, Math.floor((now - start) / 1000));
  return (
    <span className="tabular-nums">
      {String(Math.floor(s / 60)).padStart(2, '0')}:{String(s % 60).padStart(2, '0')}
    </span>
  );
}

const initials = (name: string) =>
  name
    .replace(/^Dr\.?\s+/i, '')
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');

export default function CallStage({ type, peerName, peerRoleLabel, peer, windowOpen, opensAt, active, call }: Props) {
  const remoteVideo = useRef<HTMLVideoElement>(null);
  const remoteAudio = useRef<HTMLAudioElement>(null);
  const localVideo = useRef<HTMLVideoElement>(null);
  useAttach(remoteVideo, call.remoteStream);
  useAttach(remoteAudio, call.remoteStream);
  useAttach(localVideo, call.localStream);

  const inCall = call.state !== 'idle' && call.state !== 'error';
  const remoteHasVideo = !!call.remoteStream?.getVideoTracks().some((t) => t.readyState === 'live');

  if (type === 'CHAT') {
    return (
      <div className="flex items-center gap-3 rounded-3xl border border-line bg-white p-5">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sage text-forest">
          <MessageSquare className="h-5 w-5" />
        </span>
        <div className="text-sm">
          <p className="font-semibold text-ink">Chat consultation</p>
          <p className="text-ink-muted">
            {peer.present ? `${peerName} is in the room.` : `Waiting for ${peerName} to open the consultation.`}
          </p>
        </div>
      </div>
    );
  }

  const statusLine = (() => {
    switch (call.state) {
      case 'starting':
        return 'Starting your camera and microphone…';
      case 'waiting':
        return peer.inCall ? 'Connecting…' : `Waiting for ${peerName} to join the call…`;
      case 'connecting':
        return 'Connecting…';
      case 'reconnecting':
        return 'Connection interrupted. Reconnecting…';
      default:
        return '';
    }
  })();

  return (
    <div className="relative overflow-hidden rounded-3xl bg-[#0E1A14] text-white">
      <div className="relative aspect-video min-h-[260px] w-full">
        {/* Remote media */}
        {/* Remote sound always plays through the <audio> element; the video is muted to avoid double audio */}
        {type === 'VIDEO' && <video ref={remoteVideo} autoPlay playsInline muted className={`absolute inset-0 h-full w-full object-cover ${remoteHasVideo ? '' : 'hidden'}`} />}
        <audio ref={remoteAudio} autoPlay className="hidden" />

        {(!remoteHasVideo || type === 'AUDIO') && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-leaf-pattern">
            <span className={`flex h-24 w-24 items-center justify-center rounded-full bg-white/10 text-3xl font-semibold ${call.state === 'connected' ? 'ring-4 ring-emerald-400/40' : ''}`}>
              {initials(peerName) || '•'}
            </span>
            <p className="font-display text-xl">{peerName}</p>
            <p className="text-sm text-white/60">{peerRoleLabel}</p>
          </div>
        )}

        {/* Local preview */}
        {type === 'VIDEO' && call.localStream && (
          <div className="absolute bottom-20 right-4 h-28 w-40 overflow-hidden rounded-2xl border border-white/20 bg-black shadow-xl sm:h-32 sm:w-48">
            <video ref={localVideo} autoPlay playsInline muted className={`h-full w-full -scale-x-100 object-cover ${call.camOn ? '' : 'hidden'}`} />
            {!call.camOn && <div className="flex h-full items-center justify-center text-xs text-white/60">Camera off</div>}
          </div>
        )}

        {/* Top bar */}
        <div className="absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/50 to-transparent px-5 py-4 text-sm">
          <span className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${peer.present ? 'bg-emerald-400' : 'bg-white/40'}`} />
            {peer.inCall ? `${peerName} is in the call` : peer.present ? `${peerName} is in the room` : `${peerName} has not joined yet`}
          </span>
          {call.state === 'connected' && (
            <span className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1">
              <Wifi className="h-3.5 w-3.5 text-emerald-300" /> <Timer running />
            </span>
          )}
        </div>

        {/* Centre status */}
        {statusLine && (
          <div className="absolute inset-x-0 top-1/2 mt-16 flex justify-center">
            <span className="flex items-center gap-2 rounded-full bg-black/50 px-4 py-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> {statusLine}
            </span>
          </div>
        )}

        {/* Join prompt */}
        {!inCall && (
          <div className="absolute inset-0 flex flex-col items-center justify-end gap-3 bg-gradient-to-t from-black/70 via-black/20 to-transparent p-6 text-center">
            {call.error && (
              <p className="flex max-w-md items-start gap-2 rounded-xl bg-red-500/20 px-4 py-2 text-left text-sm text-red-100">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {call.error}
              </p>
            )}
            {!active ? (
              <p className="text-sm text-white/70">This consultation is no longer active.</p>
            ) : !windowOpen ? (
              <p className="text-sm text-white/80">
                The call opens at{' '}
                {new Date(opensAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' })} IST
                (15 minutes before the appointment). You can still use the chat below.
              </p>
            ) : (
              <button
                onClick={call.join}
                className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-7 py-3.5 font-semibold text-[#0E1A14] shadow-lg transition hover:bg-emerald-400 cursor-pointer"
              >
                {type === 'VIDEO' ? <Video className="h-5 w-5" /> : <Phone className="h-5 w-5" />}
                Join {type === 'VIDEO' ? 'video' : 'audio'} call
              </button>
            )}
          </div>
        )}
      </div>

      {/* Controls */}
      {inCall && (
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-3 bg-gradient-to-t from-black/60 to-transparent pb-4 pt-8">
          {call.error && <span className="absolute left-4 top-0 max-w-[45%] truncate text-xs text-amber-200">{call.error}</span>}
          <button
            onClick={call.toggleMic}
            aria-label={call.micOn ? 'Mute microphone' : 'Unmute microphone'}
            className={`flex h-12 w-12 items-center justify-center rounded-full transition cursor-pointer ${call.micOn ? 'bg-white/15 hover:bg-white/25' : 'bg-red-500 hover:bg-red-600'}`}
          >
            {call.micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
          </button>
          {type === 'VIDEO' && (
            <button
              onClick={call.toggleCam}
              disabled={!call.localStream?.getVideoTracks().length}
              aria-label={call.camOn ? 'Turn camera off' : 'Turn camera on'}
              className={`flex h-12 w-12 items-center justify-center rounded-full transition cursor-pointer disabled:opacity-40 ${call.camOn ? 'bg-white/15 hover:bg-white/25' : 'bg-red-500 hover:bg-red-600'}`}
            >
              {call.camOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
            </button>
          )}
          <button
            onClick={call.leave}
            aria-label="Leave call"
            className="flex h-12 items-center gap-2 rounded-full bg-red-500 px-5 font-semibold transition hover:bg-red-600 cursor-pointer"
          >
            <PhoneOff className="h-5 w-5" /> Leave
          </button>
        </div>
      )}
    </div>
  );
}
