'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Video,
  Mic,
  Volume2,
  Wifi,
  PlayCircle,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  ArrowLeft,
  RotateCcw,
  MicOff,
  VideoOff,
} from 'lucide-react';
import Logo from '@/components/brand/Logo';
import { useAuth } from '@/context/AuthContext';
import { useLocalMedia } from '@/components/call/useLocalMedia';
import { useAudioLevel, levelBars } from '@/components/call/useAudioLevel';
import DeviceSettings, { canPickSpeaker } from '@/components/call/DeviceSettings';

type Status = 'idle' | 'running' | 'pass' | 'warn' | 'fail';

interface NetworkResult {
  status: Status;
  host: boolean;
  stun: boolean;
  turn: boolean;
  turnConfigured: boolean;
  detail: string;
}

interface LoopResult {
  status: Status;
  detail: string;
  rttMs?: number;
  kbps?: number;
  frames?: number;
}

function Badge({ status }: { status: Status }) {
  if (status === 'running') return <Loader2 className="h-5 w-5 animate-spin text-ink-muted" />;
  if (status === 'pass') return <CheckCircle2 className="h-5 w-5 text-forest" />;
  if (status === 'warn') return <AlertTriangle className="h-5 w-5 text-amber-600" />;
  if (status === 'fail') return <XCircle className="h-5 w-5 text-red-600" />;
  return <span className="h-5 w-5 rounded-full border-2 border-line" />;
}

function Card({ icon: Icon, title, status, children }: { icon: typeof Video; title: string; status: Status; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-line bg-white p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-semibold text-ink">
          <Icon className="h-5 w-5 text-forest" /> {title}
        </h2>
        <Badge status={status} />
      </div>
      {children}
    </section>
  );
}

/** Gather connection candidates to see which routes this network allows. */
async function testNetwork(iceServers: RTCIceServer[], turnConfigured: boolean): Promise<NetworkResult> {
  const pc = new RTCPeerConnection({ iceServers });
  pc.createDataChannel('probe');
  const found = { host: false, stun: false, turn: false };
  await new Promise<void>((resolve) => {
    const done = setTimeout(resolve, 8000);
    pc.onicecandidate = (e) => {
      if (!e.candidate) {
        clearTimeout(done);
        resolve();
        return;
      }
      const c = e.candidate.candidate;
      if (/ typ host /.test(c)) found.host = true;
      if (/ typ srflx /.test(c)) found.stun = true;
      if (/ typ relay /.test(c)) found.turn = true;
    };
    pc.createOffer().then((o) => pc.setLocalDescription(o));
  });
  pc.close();

  if (found.turn || (found.stun && !turnConfigured)) {
    return {
      status: found.turn ? 'pass' : 'warn',
      ...found,
      turnConfigured,
      detail: found.turn
        ? 'Your network can make calls, including through firewalls.'
        : 'Calls should work on most networks. Some strict office or mobile networks may still block them; adding a TURN relay server fixes that.',
    };
  }
  if (found.stun) {
    return { status: 'warn', ...found, turnConfigured, detail: 'Direct calls should work, but the relay server could not be reached, so calls may fail on strict networks.' };
  }
  return {
    status: 'fail',
    ...found,
    turnConfigured,
    detail: 'Your network is blocking the connection checks. Try another network (for example mobile data), or ask your IT team to allow video calls.',
  };
}

/** Send your own camera and microphone through a real call connection and back. */
async function testLoopback(
  iceServers: RTCIceServer[],
  tracks: MediaStreamTrack[],
  onRemote: (s: MediaStream) => void
): Promise<{ result: LoopResult; stop: () => void }> {
  const a = new RTCPeerConnection({ iceServers });
  const b = new RTCPeerConnection({ iceServers });
  const stop = () => {
    a.close();
    b.close();
  };
  a.onicecandidate = (e) => e.candidate && b.addIceCandidate(e.candidate).catch(() => {});
  b.onicecandidate = (e) => e.candidate && a.addIceCandidate(e.candidate).catch(() => {});
  const remote = new MediaStream();
  b.ontrack = (e) => {
    remote.addTrack(e.track);
    onRemote(new MediaStream(remote.getTracks()));
  };
  tracks.forEach((t) => a.addTrack(t));

  const offer = await a.createOffer();
  await a.setLocalDescription(offer);
  await b.setRemoteDescription(offer);
  const answer = await b.createAnswer();
  await b.setLocalDescription(answer);
  await a.setRemoteDescription(answer);

  const connected = await new Promise<boolean>((resolve) => {
    const t = setTimeout(() => resolve(false), 10000);
    const check = () => {
      if (b.connectionState === 'connected') {
        clearTimeout(t);
        resolve(true);
      } else if (b.connectionState === 'failed') {
        clearTimeout(t);
        resolve(false);
      }
    };
    b.onconnectionstatechange = check;
    check();
  });
  if (!connected) return { result: { status: 'fail', detail: 'The test call could not connect in this browser.' }, stop };

  // Let media flow for a few seconds, then measure
  await new Promise((r) => setTimeout(r, 4000));
  let bytes = 0;
  let frames = 0;
  let rtt: number | undefined;
  const statsA = await a.getStats();
  statsA.forEach((s) => {
    const r = s as RTCStats & Record<string, unknown>;
    if (r.type === 'candidate-pair' && r.state === 'succeeded' && typeof r.currentRoundTripTime === 'number') rtt = r.currentRoundTripTime * 1000;
  });
  const statsB = await b.getStats();
  statsB.forEach((s) => {
    const r = s as RTCStats & Record<string, unknown>;
    if (r.type === 'inbound-rtp') {
      bytes += Number(r.bytesReceived || 0);
      if (r.kind === 'video') frames += Number(r.framesDecoded || 0);
    }
  });
  const kbps = Math.round((bytes * 8) / 1000 / 4);
  const hasVideo = tracks.some((t) => t.kind === 'video');
  const ok = bytes > 0 && (!hasVideo || frames > 0);
  return {
    result: {
      status: ok ? 'pass' : 'fail',
      rttMs: rtt !== undefined ? Math.round(rtt) : undefined,
      kbps,
      frames,
      detail: ok ? 'Audio and video travelled through a real call connection and came back.' : 'Media did not flow through the test call.',
    },
    stop,
  };
}

export default function CallTestPage() {
  const { user, loading } = useAuth();
  const media = useLocalMedia(true);
  const previewRef = useRef<HTMLVideoElement>(null);
  const loopRef = useRef<HTMLVideoElement>(null);
  const loopStop = useRef<(() => void) | null>(null);

  const [heardMic, setHeardMic] = useState(false);
  const [speakerAnswer, setSpeakerAnswer] = useState<'yes' | 'no' | null>(null);
  const [playing, setPlaying] = useState(false);
  const [network, setNetwork] = useState<NetworkResult | null>(null);
  const [loop, setLoop] = useState<LoopResult | null>(null);
  const [loopStream, setLoopStream] = useState<MediaStream | null>(null);
  const [ice, setIce] = useState<{ iceServers: RTCIceServer[]; turnConfigured: boolean } | null>(null);
  const [iceError, setIceError] = useState('');

  const level = useAudioLevel(media.audioTrack(), media.micOn);
  // Mark the microphone as working once it has picked up some sound
  if (level > 0.12 && !heardMic) setHeardMic(true);

  useEffect(() => {
    if (previewRef.current && previewRef.current.srcObject !== media.preview) previewRef.current.srcObject = media.preview;
  });
  useEffect(() => {
    if (loopRef.current && loopRef.current.srcObject !== loopStream) loopRef.current.srcObject = loopStream;
  });

  useEffect(() => {
    if (!loading && user && !media.ready) media.start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user]);

  useEffect(() => {
    if (loading || !user) return;
    fetch('/api/call/ice-servers')
      .then(async (r) => {
        const j = await r.json();
        if (r.ok) setIce(j);
        else setIceError(j.error || 'Could not load the connection settings.');
      })
      .catch(() => setIceError('Could not reach the server.'));
  }, [loading, user]);

  useEffect(() => () => loopStop.current?.(), []);

  const playTestSound = useCallback(async () => {
    setPlaying(true);
    setSpeakerAnswer(null);
    try {
      const ctx = new AudioContext();
      const dest = ctx.createMediaStreamDestination();
      // Three soft chimes
      [523.25, 659.25, 783.99].forEach((freq, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.frequency.value = freq;
        g.gain.setValueAtTime(0, ctx.currentTime + i * 0.35);
        g.gain.linearRampToValueAtTime(0.25, ctx.currentTime + i * 0.35 + 0.03);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.35 + 0.5);
        o.connect(g).connect(dest);
        o.start(ctx.currentTime + i * 0.35);
        o.stop(ctx.currentTime + i * 0.35 + 0.55);
      });
      const el = new Audio() as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
      el.srcObject = dest.stream;
      if (media.selected.audioOut && el.setSinkId && canPickSpeaker()) await el.setSinkId(media.selected.audioOut).catch(() => {});
      await el.play();
      setTimeout(() => {
        el.pause();
        ctx.close();
        setPlaying(false);
      }, 1600);
    } catch {
      setPlaying(false);
    }
  }, [media.selected.audioOut]);

  const runNetwork = useCallback(async () => {
    if (!ice) return;
    setNetwork({ status: 'running', host: false, stun: false, turn: false, turnConfigured: ice.turnConfigured, detail: 'Checking your connection…' });
    setNetwork(await testNetwork(ice.iceServers, ice.turnConfigured));
  }, [ice]);

  const runLoopback = useCallback(async () => {
    if (!ice) return;
    loopStop.current?.();
    setLoopStream(null);
    setLoop({ status: 'running', detail: 'Making a test call to yourself…' });
    const tracks = [media.audioTrack(), media.videoTrack()].filter((t): t is MediaStreamTrack => !!t);
    if (!tracks.length) {
      setLoop({ status: 'fail', detail: 'Start your camera or microphone first.' });
      return;
    }
    try {
      const { result, stop } = await testLoopback(ice.iceServers, tracks, setLoopStream);
      loopStop.current = stop;
      setLoop(result);
    } catch {
      setLoop({ status: 'fail', detail: 'This browser could not create a call connection.' });
    }
  }, [ice, media]);

  const runAll = useCallback(async () => {
    await runNetwork();
    await runLoopback();
  }, [runNetwork, runLoopback]);

  // Run the network and loop-back checks automatically once everything is ready
  const autoRan = useRef(false);
  useEffect(() => {
    if (autoRan.current || !ice || !media.ready) return;
    autoRan.current = true;
    runAll();
  }, [ice, media.ready, runAll]);

  if (!loading && !user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-bg p-6">
        <div className="max-w-md rounded-3xl border border-line bg-white p-8 text-center">
          <p className="font-semibold text-ink">Please sign in to test your camera, microphone and connection.</p>
          <Link href="/patient/login" className="mt-5 inline-block rounded-full bg-forest px-6 py-3 text-sm font-semibold text-white">
            Sign in
          </Link>
        </div>
      </main>
    );
  }

  const camStatus: Status = !media.ready ? 'running' : media.hasCamera && media.camOn ? 'pass' : media.hasCamera ? 'warn' : 'fail';
  const micStatus: Status = !media.ready ? 'running' : !media.hasMic ? 'fail' : heardMic ? 'pass' : 'warn';
  const speakerStatus: Status = speakerAnswer === 'yes' ? 'pass' : speakerAnswer === 'no' ? 'fail' : 'idle';
  const all = [camStatus, micStatus, speakerStatus, network?.status ?? 'idle', loop?.status ?? 'idle'];
  const ready = all.every((s) => s === 'pass' || s === 'warn') && micStatus !== 'warn';
  const backHref = user?.role === 'DOCTOR' ? '/doctor/dashboard' : user?.role === 'ADMIN' ? '/admin/dashboard' : '/patient/dashboard';

  return (
    <main className="min-h-screen bg-bg px-4 py-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center justify-between">
          <Logo />
          <Link href={backHref} className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink">
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-semibold text-ink">Test your call setup</h1>
            <p className="mt-1 text-ink-muted">Check your camera, microphone, speakers and internet before a consultation. Nothing here is recorded or shared.</p>
          </div>
          <button
            onClick={runAll}
            disabled={!ice || !media.ready || network?.status === 'running' || loop?.status === 'running'}
            className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-5 py-2.5 text-sm font-semibold text-ink hover:border-forest/40 disabled:opacity-50 cursor-pointer"
          >
            <RotateCcw className="h-4 w-4" /> Run checks again
          </button>
        </div>

        {/* Overall verdict */}
        <div
          className={`flex items-start gap-3 rounded-3xl p-5 ${
            ready ? 'bg-sage text-forest' : all.includes('fail') ? 'bg-red-50 text-red-800' : 'bg-white text-ink'
          } border border-line`}
        >
          {ready ? <CheckCircle2 className="mt-0.5 h-5 w-5" /> : all.includes('fail') ? <XCircle className="mt-0.5 h-5 w-5" /> : <Loader2 className="mt-0.5 h-5 w-5 animate-spin" />}
          <p className="text-sm font-medium">
            {ready
              ? 'You’re ready for video and audio consultations on this device.'
              : all.includes('fail')
                ? 'Something needs attention. See the red items below.'
                : 'Checking… Say something to test your microphone, and play the test sound.'}
          </p>
        </div>

        {iceError && <p className="rounded-2xl bg-red-50 p-4 text-sm text-red-700">{iceError}</p>}

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Camera */}
          <Card icon={Video} title="Camera" status={camStatus}>
            <div className="relative aspect-video overflow-hidden rounded-2xl bg-[#0E1A14]">
              {media.preview && media.camOn ? (
                <video ref={previewRef} autoPlay playsInline muted className="h-full w-full -scale-x-100 object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-white/60">
                  {!media.ready ? 'Starting camera…' : media.hasCamera ? 'Camera is turned off' : 'No camera found'}
                </div>
              )}
              {media.ready && media.hasCamera && (
                <button
                  onClick={media.toggleCam}
                  aria-label={media.camOn ? 'Turn off camera' : 'Turn on camera'}
                  className={`absolute bottom-3 left-1/2 flex h-10 w-10 -translate-x-1/2 items-center justify-center rounded-full text-white cursor-pointer ${media.camOn ? 'bg-white/20' : 'bg-red-500'}`}
                >
                  {media.camOn ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
                </button>
              )}
            </div>
            {media.error && <p className="mt-3 text-sm text-red-700">{media.error}</p>}
            {media.ready && media.error && !media.hasMic && !media.hasCamera && (
              <button onClick={() => media.start()} className="mt-3 rounded-full bg-forest px-5 py-2 text-sm font-semibold text-white cursor-pointer">
                Try again
              </button>
            )}
          </Card>

          {/* Microphone */}
          <Card icon={Mic} title="Microphone" status={micStatus}>
            <p className="text-sm text-ink-muted">Say a few words. The bars should move while you speak.</p>
            <div className="mt-4 flex h-16 items-end gap-1.5">
              {levelBars(media.micOn ? level : 0).map((on, i) => (
                <span key={i} className={`w-6 rounded-md transition-all ${on ? 'bg-forest' : 'bg-line'}`} style={{ height: 12 + i * 12 }} />
              ))}
              {media.hasMic && (
                <button
                  onClick={media.toggleMic}
                  className={`ml-auto flex h-10 w-10 items-center justify-center rounded-full cursor-pointer ${media.micOn ? 'bg-bg text-ink' : 'bg-red-500 text-white'}`}
                  aria-label={media.micOn ? 'Mute microphone' : 'Unmute microphone'}
                >
                  {media.micOn ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
                </button>
              )}
            </div>
            <p className={`mt-3 text-sm ${heardMic ? 'text-forest' : 'text-ink-muted'}`}>
              {!media.hasMic && media.ready ? 'No microphone found.' : heardMic ? 'We can hear you.' : 'Waiting to hear you…'}
            </p>
            <div className="mt-5">
              <DeviceSettings media={media} showVideo />
            </div>
          </Card>

          {/* Speakers */}
          <Card icon={Volume2} title="Speakers or headphones" status={speakerStatus}>
            <p className="text-sm text-ink-muted">Play a short sound to check you can hear the other person.</p>
            <button
              onClick={playTestSound}
              disabled={playing}
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-forest px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60 cursor-pointer"
            >
              <PlayCircle className="h-4 w-4" /> {playing ? 'Playing…' : 'Play test sound'}
            </button>
            <div className="mt-4 flex items-center gap-2 text-sm">
              <span className="text-ink-muted">Did you hear it?</span>
              <button onClick={() => setSpeakerAnswer('yes')} className={`rounded-full border px-3 py-1 cursor-pointer ${speakerAnswer === 'yes' ? 'border-forest bg-sage text-forest' : 'border-line'}`}>
                Yes
              </button>
              <button onClick={() => setSpeakerAnswer('no')} className={`rounded-full border px-3 py-1 cursor-pointer ${speakerAnswer === 'no' ? 'border-red-300 bg-red-50 text-red-700' : 'border-line'}`}>
                No
              </button>
            </div>
            {speakerAnswer === 'no' && (
              <p className="mt-3 text-sm text-red-700">Check your volume and that the right speaker is selected in the Microphone card&apos;s Speaker list, then try again.</p>
            )}
          </Card>

          {/* Network */}
          <Card icon={Wifi} title="Internet connection" status={network?.status ?? 'idle'}>
            <p className="text-sm text-ink-muted">{network?.detail || 'Checks whether your network allows video calls.'}</p>
            {network && network.status !== 'running' && (
              <ul className="mt-4 space-y-1.5 text-sm">
                {[
                  ['Local network', network.host],
                  ['Direct internet route (STUN)', network.stun],
                  [network.turnConfigured ? 'Relay route for strict networks (TURN)' : 'Relay route (TURN): not set up', network.turn],
                ].map(([label, ok]) => (
                  <li key={String(label)} className="flex items-center gap-2">
                    {ok ? <CheckCircle2 className="h-4 w-4 text-forest" /> : <XCircle className="h-4 w-4 text-ink-muted" />} {label}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {/* Loop-back test call */}
        <Card icon={PlayCircle} title="Test call" status={loop?.status ?? 'idle'}>
          <div className="grid gap-5 md:grid-cols-[1fr_1fr]">
            <div className="relative aspect-video overflow-hidden rounded-2xl bg-[#0E1A14]">
              {loopStream ? (
                <video ref={loopRef} autoPlay playsInline muted className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center px-6 text-center text-sm text-white/60">
                  Your video will appear here after travelling through a real call connection.
                </div>
              )}
            </div>
            <div className="space-y-3 text-sm">
              <p className="text-ink-muted">{loop?.detail || 'Sends your camera and microphone through a call connection and back, the same way a consultation does.'}</p>
              {loop?.status === 'pass' && (
                <dl className="grid grid-cols-3 gap-3">
                  <div className="rounded-xl bg-bg p-3">
                    <dt className="text-[11px] uppercase text-ink-muted">Round trip</dt>
                    <dd className="font-semibold text-ink">{loop.rttMs ?? '<1'} ms</dd>
                  </div>
                  <div className="rounded-xl bg-bg p-3">
                    <dt className="text-[11px] uppercase text-ink-muted">Bitrate</dt>
                    <dd className="font-semibold text-ink">{loop.kbps} kbps</dd>
                  </div>
                  <div className="rounded-xl bg-bg p-3">
                    <dt className="text-[11px] uppercase text-ink-muted">Video frames</dt>
                    <dd className="font-semibold text-ink">{loop.frames}</dd>
                  </div>
                </dl>
              )}
              <button
                onClick={runLoopback}
                disabled={!ice || !media.ready || loop?.status === 'running'}
                className="inline-flex items-center gap-2 rounded-full bg-forest px-5 py-2.5 font-semibold text-white disabled:opacity-50 cursor-pointer"
              >
                {loop?.status === 'running' ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />} Run test call
              </button>
            </div>
          </div>
        </Card>

        <p className="text-center text-xs text-ink-muted">
          To test a full consultation between two people, an administrator can create a free test consultation from Admin → Test consultations.
        </p>
      </div>
    </main>
  );
}
