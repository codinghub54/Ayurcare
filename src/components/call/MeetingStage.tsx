'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
  Phone,
  Loader2,
  AlertCircle,
  MessageSquare,
  MonitorUp,
  MonitorX,
  Settings,
  Maximize,
  Minimize,
  Volume2,
  WifiOff,
  ArrowLeftRight,
} from 'lucide-react';
import type { CallQuality, CallState, ConsultType, PeerMediaState } from '@/components/consultation/useConsultationRoom';
import type { LocalMedia } from './useLocalMedia';
import { useAudioLevel, levelBars } from './useAudioLevel';
import DeviceSettings, { canPickSpeaker } from './DeviceSettings';

interface CallApi {
  state: CallState;
  error: string;
  remoteStream: MediaStream | null;
  remoteState: PeerMediaState;
  quality: CallQuality;
  route: 'direct' | 'relay' | null;
  join: (media: LocalMedia) => Promise<void>;
  leave: () => void;
  sendState: () => void;
}

interface Props {
  type: ConsultType;
  selfName: string;
  peerName: string;
  peerRoleLabel: string;
  peer: { present: boolean; inCall: boolean };
  windowOpen: boolean;
  opensAt: string;
  active: boolean;
  call: CallApi;
  media: LocalMedia;
}

const initials = (name: string) =>
  name
    .replace(/^Dr\.?\s+/i, '')
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');

/** Keep a media element showing a stream, including elements that mount later. */
function useAttach(ref: React.RefObject<HTMLMediaElement | null>, stream: MediaStream | null) {
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream;
  });
}

function Timer() {
  const [start] = useState(() => Date.now());
  const [now, setNow] = useState(start);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const s = Math.max(0, Math.floor((now - start) / 1000));
  const h = Math.floor(s / 3600);
  return (
    <span className="tabular-nums">
      {h > 0 ? `${h}:` : ''}
      {String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:{String(s % 60).padStart(2, '0')}
    </span>
  );
}

function QualityBars({ quality }: { quality: CallQuality }) {
  const n = quality === 'good' ? 3 : quality === 'fair' ? 2 : quality === 'poor' ? 1 : 0;
  const color = quality === 'good' ? 'bg-emerald-400' : quality === 'fair' ? 'bg-amber-300' : 'bg-red-400';
  return (
    <span className="flex items-end gap-0.5" aria-label={`Connection ${quality}`} title={`Connection: ${quality}`}>
      {[1, 2, 3].map((i) => (
        <span key={i} className={`w-1 rounded-sm ${i <= n ? color : 'bg-white/25'}`} style={{ height: 4 + i * 3 }} />
      ))}
    </span>
  );
}

function MicMeter({ level, muted, dark = true }: { level: number; muted: boolean; dark?: boolean }) {
  return (
    <span className="flex items-end gap-0.5" aria-hidden="true">
      {levelBars(muted ? 0 : level).map((on, i) => (
        <span
          key={i}
          className={`w-1 rounded-sm transition-all ${on ? 'bg-emerald-400' : dark ? 'bg-white/25' : 'bg-line'}`}
          style={{ height: 4 + i * 3 }}
        />
      ))}
    </span>
  );
}

function RoundButton({
  onClick,
  active = true,
  danger = false,
  label,
  children,
  disabled,
}: {
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
  label: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      disabled={disabled}
      className={`flex h-12 w-12 items-center justify-center rounded-full transition cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 ${
        danger ? 'bg-red-500 hover:bg-red-600' : active ? 'bg-white/15 hover:bg-white/25' : 'bg-red-500 hover:bg-red-600'
      }`}
    >
      {children}
    </button>
  );
}

export default function MeetingStage({ type, selfName, peerName, peerRoleLabel, peer, windowOpen, opensAt, active, call, media }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mainVideo = useRef<HTMLVideoElement>(null);
  const pipVideo = useRef<HTMLVideoElement>(null);
  const lobbyVideo = useRef<HTMLVideoElement>(null);
  const remoteAudio = useRef<HTMLAudioElement>(null);

  const [swapped, setSwapped] = useState(false); // self view large, peer small
  const [showSettings, setShowSettings] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [online, setOnline] = useState(true);
  const [joining, setJoining] = useState(false);

  const inCall = call.state !== 'idle' && call.state !== 'error';
  const isVideo = type === 'VIDEO';
  const remote = call.remoteStream;
  const remoteHasVideo = !!remote?.getVideoTracks().some((t) => t.readyState === 'live');
  const peerCamOn = call.remoteState.cam ?? remoteHasVideo;
  const peerShowsVideo = isVideo && remoteHasVideo && (peerCamOn || call.remoteState.sharing);
  const selfShowsVideo = isVideo && !!media.preview && (media.camOn || media.sharing);

  const selfLevel = useAudioLevel(media.audioTrack(), media.micOn);
  const peerLevel = useAudioLevel(remote?.getAudioTracks()[0] ?? null, call.state === 'connected');
  const peerSpeaking = peerLevel > 0.08 && call.remoteState.mic !== false;
  const selfSpeaking = selfLevel > 0.08 && media.micOn;
  const mutedSpeech = useMutedSpeechHint(media);
  const talkingWhileMuted = inCall && !media.micOn && media.hasMic && mutedSpeech;

  // Attach streams
  useAttach(remoteAudio, remote);
  useAttach(lobbyVideo, media.preview);
  useEffect(() => {
    const mainSrc = swapped ? media.preview : remote;
    const pipSrc = swapped ? remote : media.preview;
    if (mainVideo.current && mainVideo.current.srcObject !== mainSrc) mainVideo.current.srcObject = mainSrc;
    if (pipVideo.current && pipVideo.current.srcObject !== pipSrc) pipVideo.current.srcObject = pipSrc;
  });

  // Browsers may block sound until the user interacts with the page
  useEffect(() => {
    const el = remoteAudio.current;
    if (!el || !remote) return;
    el.play()
      .then(() => setAudioBlocked(false))
      .catch(() => setAudioBlocked(true));
  }, [remote]);

  // Chosen speaker
  useEffect(() => {
    const el = remoteAudio.current as (HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }) | null;
    if (el?.setSinkId && media.selected.audioOut && canPickSpeaker()) el.setSinkId(media.selected.audioOut).catch(() => {});
  }, [media.selected.audioOut, remote]);

  // Share mic / camera / screen state with the other person
  useEffect(() => {
    call.sendState();
  }, [media.micOn, media.camOn, media.sharing, call]);

  // Start the camera/mic preview automatically when the call can be joined
  useEffect(() => {
    if (type !== 'CHAT' && active && windowOpen && !media.ready) media.start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, active, windowOpen, media.ready]);

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  useEffect(() => {
    const onFs = () => setFullscreen(document.fullscreenElement === container.current);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else container.current?.requestFullscreen?.().catch(() => {});
  }, []);

  // Keyboard shortcuts like other meeting apps: Ctrl/⌘+D mic, Ctrl/⌘+E camera
  useEffect(() => {
    if (!inCall) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === 'd') {
        e.preventDefault();
        media.toggleMic();
      } else if (k === 'e' && isVideo) {
        e.preventDefault();
        media.toggleCam();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [inCall, isVideo, media]);

  const join = async () => {
    setJoining(true);
    if (!media.ready) await media.start();
    await call.join(media);
    setJoining(false);
  };

  const leave = () => {
    if (media.sharing) media.stopShare();
    call.leave();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  };

  /* ------------------------------ CHAT ------------------------------ */
  if (type === 'CHAT') {
    return (
      <div className="flex items-center gap-3 rounded-3xl border border-line bg-white p-5">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sage text-forest">
          <MessageSquare className="h-5 w-5" />
        </span>
        <div className="text-sm">
          <p className="font-semibold text-ink">Chat consultation</p>
          <p className="text-ink-muted">{peer.present ? `${peerName} is in the room.` : `Waiting for ${peerName} to open the consultation.`}</p>
        </div>
      </div>
    );
  }

  /* ------------------------------ LOBBY ------------------------------ */
  if (!inCall) {
    const micBars = <MicMeter level={selfLevel} muted={!media.micOn} />;
    return (
      <div className="@container overflow-hidden rounded-3xl bg-[#0E1A14] text-white">
        {/* Side-by-side only when this card itself is wide enough; otherwise preview above, controls below */}
        <div className="grid grid-cols-1 @4xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          {/* Self preview */}
          <div className="relative aspect-video min-h-[220px] min-w-0 bg-black">
            {isVideo && selfShowsVideo ? (
              <video ref={lobbyVideo} autoPlay playsInline muted className="h-full w-full -scale-x-100 object-cover" />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-leaf-pattern">
                <span className={`flex h-20 w-20 items-center justify-center rounded-full bg-white/10 text-2xl font-semibold ${selfSpeaking ? 'ring-4 ring-emerald-400/60' : ''}`}>
                  {initials(selfName) || '•'}
                </span>
                <p className="text-sm text-white/60">{!media.ready ? 'Camera and microphone are off' : isVideo ? 'Your camera is off' : 'Audio call'}</p>
              </div>
            )}

            {media.ready && (
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-3 bg-gradient-to-t from-black/70 to-transparent pb-4 pt-10">
                <RoundButton onClick={media.toggleMic} active={media.micOn} disabled={!media.hasMic} label={media.micOn ? 'Turn off microphone' : 'Turn on microphone'}>
                  {media.micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
                </RoundButton>
                {isVideo && (
                  <RoundButton onClick={media.toggleCam} active={media.camOn} disabled={!media.hasCamera} label={media.camOn ? 'Turn off camera' : 'Turn on camera'}>
                    {media.camOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
                  </RoundButton>
                )}
              </div>
            )}
            {media.ready && <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-black/50 px-3 py-1.5 text-xs">{micBars} {media.micOn ? 'Microphone' : 'Muted'}</div>}
          </div>

          {/* Join panel */}
          <div className="flex min-w-0 flex-col justify-center gap-5 p-6">
            <div>
              <p className="font-display text-2xl">Ready to join?</p>
              <p className="mt-1 flex items-center gap-2 text-sm text-white/70">
                <span className={`h-2 w-2 rounded-full ${peer.inCall ? 'bg-emerald-400' : peer.present ? 'bg-amber-300' : 'bg-white/40'}`} />
                {peer.inCall ? `${peerName} is in the call` : peer.present ? `${peerName} is in the room` : `${peerName} has not joined yet`}
              </p>
            </div>

            {(media.error || call.error) && (
              <p className="flex items-start gap-2 rounded-xl bg-red-500/15 px-3 py-2 text-sm text-red-100">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {media.error || call.error}
              </p>
            )}

            {!active ? (
              <p className="text-sm text-white/70">This consultation is no longer active.</p>
            ) : !windowOpen ? (
              <p className="text-sm text-white/80">
                The call opens at {new Date(opensAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' })} IST,
                15 minutes before the appointment. You can use the chat until then.
              </p>
            ) : (
              <>
                {media.ready && media.error && !media.hasMic && !media.hasCamera ? (
                  <button
                    onClick={() => media.start()}
                    className="rounded-full border border-white/20 px-5 py-2.5 text-sm font-semibold hover:bg-white/10 cursor-pointer"
                  >
                    Try again
                  </button>
                ) : media.ready ? (
                  <DeviceSettings media={media} showVideo={isVideo} tone="dark" />
                ) : (
                  <button
                    onClick={() => media.start()}
                    className="rounded-full border border-white/20 px-5 py-2.5 text-sm font-semibold hover:bg-white/10 cursor-pointer"
                  >
                    Check camera and microphone
                  </button>
                )}
                <a href="/call-test" target="_blank" rel="noopener noreferrer" className="text-center text-xs text-white/60 underline-offset-2 hover:text-white hover:underline">
                  Having trouble? Test your camera, microphone and connection
                </a>
                <button
                  onClick={join}
                  disabled={joining}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-emerald-500 px-7 py-3.5 font-semibold text-[#0E1A14] shadow-lg transition hover:bg-emerald-400 disabled:opacity-60 cursor-pointer"
                >
                  {joining ? <Loader2 className="h-5 w-5 animate-spin" /> : isVideo ? <Video className="h-5 w-5" /> : <Phone className="h-5 w-5" />}
                  Join now
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ------------------------------ IN CALL ------------------------------ */
  const statusLine =
    call.state === 'waiting'
      ? peer.inCall
        ? 'Connecting…'
        : `Waiting for ${peerName} to join…`
      : call.state === 'connecting'
        ? 'Connecting…'
        : call.state === 'reconnecting'
          ? 'Connection interrupted. Reconnecting…'
          : '';

  const mainIsSelf = swapped;
  const mainShowsVideo = mainIsSelf ? selfShowsVideo : peerShowsVideo;
  const pipShowsVideo = mainIsSelf ? peerShowsVideo : selfShowsVideo;
  const mainName = mainIsSelf ? `${selfName} (you)` : peerName;
  const pipName = mainIsSelf ? peerName : 'You';
  const mainMuted = mainIsSelf ? !media.micOn : call.remoteState.mic === false;
  const pipMuted = mainIsSelf ? call.remoteState.mic === false : !media.micOn;
  const mainSpeaking = mainIsSelf ? selfSpeaking : peerSpeaking;
  const pipSpeaking = mainIsSelf ? peerSpeaking : selfSpeaking;
  const mainMirror = mainIsSelf && !media.sharing;
  const pipMirror = !mainIsSelf && !media.sharing;

  return (
    <div ref={container} className={`relative overflow-hidden bg-[#0E1A14] text-white ${fullscreen ? 'h-screen w-screen' : 'rounded-3xl'}`}>
      <audio ref={remoteAudio} autoPlay className="hidden" />

      <div className={`relative w-full ${fullscreen ? 'h-full' : 'aspect-video min-h-[280px]'}`}>
        {/* Main tile */}
        <video
          ref={mainVideo}
          autoPlay
          playsInline
          muted
          className={`absolute inset-0 h-full w-full ${mainIsSelf || !call.remoteState.sharing ? 'object-cover' : 'object-contain bg-black'} ${mainMirror ? '-scale-x-100' : ''} ${
            isVideo && mainShowsVideo ? '' : 'hidden'
          }`}
        />
        {!(isVideo && mainShowsVideo) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-leaf-pattern">
            <span
              className={`flex h-24 w-24 items-center justify-center rounded-full bg-white/10 text-3xl font-semibold transition ${
                mainSpeaking ? 'ring-4 ring-emerald-400/70' : call.state === 'connected' ? 'ring-2 ring-white/10' : ''
              }`}
            >
              {initials(mainIsSelf ? selfName : peerName) || '•'}
            </span>
            <p className="font-display text-xl">{mainIsSelf ? selfName : peerName}</p>
            <p className="text-sm text-white/60">{mainIsSelf ? 'You' : isVideo && call.state === 'connected' ? 'Camera is off' : peerRoleLabel}</p>
          </div>
        )}
        {mainSpeaking && isVideo && mainShowsVideo && <div className="pointer-events-none absolute inset-0 rounded-[inherit] ring-4 ring-inset ring-emerald-400/60" />}
        <span className="absolute bottom-20 left-4 flex items-center gap-1.5 rounded-lg bg-black/55 px-2.5 py-1 text-xs">
          {mainMuted && <MicOff className="h-3.5 w-3.5 text-red-300" />}
          {mainName}
          {!mainIsSelf && call.remoteState.sharing && ' is presenting'}
        </span>

        {/* Picture-in-picture tile (click to swap) */}
        {isVideo && (
          <button
            onClick={() => setSwapped((v) => !v)}
            aria-label="Swap videos"
            title="Swap videos"
            className={`group absolute bottom-20 right-4 h-28 w-44 overflow-hidden rounded-2xl border bg-black shadow-xl sm:h-32 sm:w-52 cursor-pointer ${
              pipSpeaking ? 'border-emerald-400 ring-2 ring-emerald-400/60' : 'border-white/20'
            }`}
          >
            <video ref={pipVideo} autoPlay playsInline muted className={`h-full w-full object-cover ${pipMirror ? '-scale-x-100' : ''} ${pipShowsVideo ? '' : 'hidden'}`} />
            {!pipShowsVideo && (
              <span className="flex h-full w-full items-center justify-center bg-white/5 text-lg font-semibold">
                {initials(mainIsSelf ? peerName : selfName) || '•'}
              </span>
            )}
            <span className="absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px]">
              {pipMuted && <MicOff className="h-3 w-3 text-red-300" />}
              {pipName}
            </span>
            <span className="absolute right-1.5 top-1.5 hidden rounded-md bg-black/60 p-1 group-hover:block">
              <ArrowLeftRight className="h-3.5 w-3.5" />
            </span>
          </button>
        )}

        {/* Top bar */}
        <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-3 bg-gradient-to-b from-black/55 to-transparent px-5 py-4 text-sm">
          <span className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${peer.inCall ? 'bg-emerald-400' : 'bg-white/40'}`} />
            {peer.inCall ? `${peerName} is in the call` : `${peerName} is not in the call`}
          </span>
          {call.state === 'connected' && (
            <span className="flex items-center gap-3 rounded-full bg-black/40 px-3 py-1">
              <QualityBars quality={call.quality} />
              {call.route === 'relay' && <span className="text-[11px] text-white/60">via relay</span>}
              <Timer />
            </span>
          )}
        </div>

        {/* Status / alerts */}
        <div className="absolute inset-x-0 top-14 flex flex-col items-center gap-2 px-4">
          {!online && (
            <span className="flex items-center gap-2 rounded-full bg-red-500/80 px-4 py-2 text-sm">
              <WifiOff className="h-4 w-4" /> You are offline. Reconnecting when your internet is back…
            </span>
          )}
          {statusLine && (
            <span className="flex items-center gap-2 rounded-full bg-black/55 px-4 py-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> {statusLine}
            </span>
          )}
          {call.state === 'connected' && call.quality === 'poor' && (
            <span className="rounded-full bg-amber-500/80 px-4 py-1.5 text-xs">Weak connection. Turning off your camera can help.</span>
          )}
          {audioBlocked && (
            <button
              onClick={() => {
                remoteAudio.current?.play().then(() => setAudioBlocked(false)).catch(() => {});
              }}
              className="flex items-center gap-2 rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-[#0E1A14] cursor-pointer"
            >
              <Volume2 className="h-4 w-4" /> Tap to turn on sound
            </button>
          )}
          {talkingWhileMuted && <span className="rounded-full bg-black/70 px-4 py-2 text-sm">You’re muted. Press the microphone to talk.</span>}
          {media.error && <span className="max-w-md rounded-xl bg-red-500/70 px-3 py-1.5 text-center text-xs">{media.error}</span>}
        </div>

        {/* Settings popover */}
        {showSettings && (
          <div className="absolute bottom-20 left-1/2 z-10 w-[300px] -translate-x-1/2 rounded-2xl border border-white/10 bg-[#13241B]/95 p-4 shadow-2xl backdrop-blur">
            <p className="mb-3 text-sm font-semibold">Audio and video settings</p>
            <DeviceSettings media={media} showVideo={isVideo} tone="dark" />
          </div>
        )}
      </div>

      {/* Control bar */}
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-2.5 bg-gradient-to-t from-black/70 to-transparent pb-4 pt-8 sm:gap-3">
        <div className="relative">
          <RoundButton onClick={media.toggleMic} active={media.micOn} disabled={!media.hasMic} label={`${media.micOn ? 'Mute' : 'Unmute'} (Ctrl+D)`}>
            {media.micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
          </RoundButton>
          {media.micOn && (
            <span className="pointer-events-none absolute -bottom-1 left-1/2 -translate-x-1/2 scale-75">
              <MicMeter level={selfLevel} muted={false} />
            </span>
          )}
        </div>
        {isVideo && (
          <RoundButton onClick={media.toggleCam} active={media.camOn} disabled={!media.hasCamera} label={`${media.camOn ? 'Turn off' : 'Turn on'} camera (Ctrl+E)`}>
            {media.camOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
          </RoundButton>
        )}
        {isVideo && media.canShareScreen && (
          <RoundButton
            onClick={media.sharing ? media.stopShare : media.startShare}
            active={!media.sharing}
            label={media.sharing ? 'Stop presenting' : 'Present your screen'}
          >
            {media.sharing ? <MonitorX className="h-5 w-5" /> : <MonitorUp className="h-5 w-5" />}
          </RoundButton>
        )}
        <RoundButton onClick={() => setShowSettings((v) => !v)} active label="Audio and video settings">
          <Settings className="h-5 w-5" />
        </RoundButton>
        {isVideo && (
          <RoundButton onClick={toggleFullscreen} active label={fullscreen ? 'Exit full screen' : 'Full screen'}>
            {fullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
          </RoundButton>
        )}
        <button
          onClick={leave}
          aria-label="Leave call"
          className="flex h-12 items-center gap-2 rounded-full bg-red-500 px-5 font-semibold transition hover:bg-red-600 cursor-pointer"
        >
          <PhoneOff className="h-5 w-5" /> Leave
        </button>
      </div>
    </div>
  );
}

/** Show "You're muted" while the microphone picks up speech during mute (measured on a copy of the mic). */
function useMutedSpeechHint(media: LocalMedia) {
  const track = media.audioTrack();
  const probe = useMemo(() => {
    if (!track || media.micOn || track.readyState !== 'live') return null;
    const clone = track.clone();
    clone.enabled = true; // the real track is disabled while muted
    return clone;
  }, [track, media.micOn]);
  useEffect(() => () => probe?.stop(), [probe]);
  const level = useAudioLevel(probe, !!probe);
  return level > 0.15;
}
