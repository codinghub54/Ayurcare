'use client';

import { useEffect, useState } from 'react';

let sharedCtx: AudioContext | null = null;
function audioContext() {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!sharedCtx) sharedCtx = new Ctor();
  return sharedCtx;
}

/**
 * Live loudness (0..1) of an audio track, sampled ~12 times a second.
 * Used for the microphone meter in the lobby and the "speaking" glow in calls.
 */
export function useAudioLevel(track: MediaStreamTrack | null | undefined, enabled = true) {
  const [level, setLevel] = useState(0);

  useEffect(() => {
    if (!track || !enabled || track.readyState !== 'live') {
      const t = setTimeout(() => setLevel(0), 0);
      return () => clearTimeout(t);
    }
    const ctx = audioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const source = ctx.createMediaStreamSource(new MediaStream([track]));
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.6;
    source.connect(analyser);
    const data = new Uint8Array(analyser.fftSize);

    const timer = setInterval(() => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / data.length);
      setLevel(Math.min(1, rms * 4));
    }, 80);

    return () => {
      clearInterval(timer);
      try {
        source.disconnect();
        analyser.disconnect();
      } catch {}
    };
  }, [track, enabled]);

  return level;
}

/** Five-bar meter like meeting apps show next to the microphone. */
export function levelBars(level: number) {
  return [0.06, 0.15, 0.3, 0.5, 0.7].map((threshold) => level >= threshold);
}
