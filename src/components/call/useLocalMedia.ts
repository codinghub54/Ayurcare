'use client';

/**
 * Local camera / microphone / screen for a call, like the "green room" of
 * meeting apps: preview before joining, pick devices, mute before entering,
 * switch devices or share the screen during the call.
 *
 * The outgoing video track is always present in video calls: when the camera
 * is off, unavailable or replaced, a black placeholder keeps the video channel
 * open, so the camera can come back or the screen can be shared at any time
 * without renegotiating the connection.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export interface DeviceOption {
  deviceId: string;
  label: string;
}

export interface MediaPrefs {
  audioIn?: string;
  videoIn?: string;
  audioOut?: string;
  micOn?: boolean;
  camOn?: boolean;
}

const PREFS_KEY = 'ayurcare-call-prefs';
const readPrefs = (): MediaPrefs => {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
  } catch {
    return {};
  }
};
const writePrefs = (p: MediaPrefs) => {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ ...readPrefs(), ...p }));
  } catch {}
};

/** A black 640x360 video track used while the camera is off or unavailable. */
function placeholderVideoTrack(): MediaStreamTrack {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 360;
  const ctx = canvas.getContext('2d');
  const draw = () => {
    if (!ctx) return;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  };
  draw();
  const stream = canvas.captureStream(2);
  const timer = setInterval(draw, 500); // keep frames flowing so the receiver doesn't stall
  const track = stream.getVideoTracks()[0];
  track.addEventListener('ended', () => clearInterval(timer));
  (track as MediaStreamTrack & { __placeholder?: boolean }).__placeholder = true;
  return track;
}

export function mediaErrorMessage(e: unknown): string {
  const name = (e as { name?: string })?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Camera or microphone access is blocked. Click the camera icon in your browser’s address bar, allow access, and try again.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No camera or microphone was found on this device.';
  if (name === 'NotReadableError' || name === 'AbortError') {
    return 'Your camera or microphone is being used by another app (for example Zoom or Teams). Close it and try again.';
  }
  return 'Could not start your camera or microphone.';
}

export function useLocalMedia(wantVideo: boolean) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(wantVideo);
  const [hasCamera, setHasCamera] = useState(false);
  const [hasMic, setHasMic] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [devices, setDevices] = useState<{ audioIn: DeviceOption[]; videoIn: DeviceOption[]; audioOut: DeviceOption[] }>({
    audioIn: [],
    videoIn: [],
    audioOut: [],
  });
  const [selected, setSelected] = useState<{ audioIn?: string; videoIn?: string; audioOut?: string }>({});
  // Stream shown in the self view (camera, or the screen while sharing)
  const [preview, setPreview] = useState<MediaStream | null>(null);

  const audioTrack = useRef<MediaStreamTrack | null>(null);
  const cameraTrack = useRef<MediaStreamTrack | null>(null);
  const screenTrack = useRef<MediaStreamTrack | null>(null);
  const placeholder = useRef<MediaStreamTrack | null>(null);
  // Called whenever the outgoing track of a kind changes, so the call can swap it in
  const onTrackChange = useRef<((kind: 'audio' | 'video', track: MediaStreamTrack | null) => void) | null>(null);

  const refreshDevices = useCallback(async () => {
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      const pick = (kind: MediaDeviceKind, fallback: string) =>
        list
          .filter((d) => d.kind === kind && d.deviceId)
          .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `${fallback} ${i + 1}` }));
      setDevices({ audioIn: pick('audioinput', 'Microphone'), videoIn: pick('videoinput', 'Camera'), audioOut: pick('audiooutput', 'Speaker') });
    } catch {}
  }, []);

  /** The video track to send right now: screen > camera (if on) > black placeholder. */
  const outgoingVideo = useCallback((): MediaStreamTrack | null => {
    if (!wantVideo) return null;
    if (screenTrack.current) return screenTrack.current;
    if (cameraTrack.current && cameraTrack.current.enabled && cameraTrack.current.readyState === 'live') return cameraTrack.current;
    if (!placeholder.current || placeholder.current.readyState !== 'live') placeholder.current = placeholderVideoTrack();
    return placeholder.current;
  }, [wantVideo]);

  const publishPreview = useCallback(() => {
    const tracks: MediaStreamTrack[] = [];
    const v = screenTrack.current || (cameraTrack.current?.readyState === 'live' ? cameraTrack.current : null);
    if (v) tracks.push(v);
    setPreview(tracks.length ? new MediaStream(tracks) : null);
  }, []);

  const emitVideo = useCallback(() => {
    onTrackChange.current?.('video', outgoingVideo());
    publishPreview();
  }, [outgoingVideo, publishPreview]);

  /** Start (or restart) the local devices. Safe to call again with different device ids. */
  const start = useCallback(
    async (opts?: { audioIn?: string; videoIn?: string }) => {
      setError('');
      const prefs = readPrefs();
      const audioIn = opts?.audioIn ?? prefs.audioIn;
      const videoIn = opts?.videoIn ?? prefs.videoIn;
      const audio: MediaTrackConstraints = { echoCancellation: true, noiseSuppression: true, autoGainControl: true, ...(audioIn ? { deviceId: { ideal: audioIn } } : {}) };
      const video: MediaTrackConstraints = {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 },
        ...(videoIn ? { deviceId: { ideal: videoIn } } : { facingMode: 'user' }),
      };

      let stream: MediaStream | null = null;
      let lastError: unknown = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio, video: wantVideo ? video : false });
      } catch (e) {
        lastError = e;
        // Try each device on its own so a missing/busy camera doesn't block the microphone
        if (wantVideo && (e as { name?: string })?.name !== 'NotAllowedError') {
          try {
            stream = await navigator.mediaDevices.getUserMedia({ audio });
          } catch (e2) {
            lastError = e2;
          }
        }
      }

      if (!stream) {
        setError(mediaErrorMessage(lastError));
        setHasMic(false);
        setHasCamera(false);
        setMicOn(false);
        setCamOn(false);
        setReady(true);
        await refreshDevices();
        return false;
      }

      audioTrack.current?.stop();
      cameraTrack.current?.stop();
      audioTrack.current = stream.getAudioTracks()[0] || null;
      cameraTrack.current = stream.getVideoTracks()[0] || null;
      setHasMic(!!audioTrack.current);
      setHasCamera(!!cameraTrack.current);
      if (wantVideo && !cameraTrack.current && lastError) setError('Your camera is not available. You can still join with audio.');

      const micPref = prefs.micOn ?? true;
      const camPref = prefs.camOn ?? true;
      if (audioTrack.current) audioTrack.current.enabled = micPref;
      setMicOn(!!audioTrack.current && micPref);
      const videoDeviceId = cameraTrack.current?.getSettings().deviceId;
      if (cameraTrack.current && !camPref) {
        // Remembered "camera off": release the camera right away
        cameraTrack.current.stop();
        cameraTrack.current = null;
      }
      setCamOn(!!cameraTrack.current);

      setSelected({
        audioIn: audioTrack.current?.getSettings().deviceId,
        videoIn: videoDeviceId,
        audioOut: prefs.audioOut,
      });
      await refreshDevices();
      onTrackChange.current?.('audio', audioTrack.current);
      emitVideo();
      setReady(true);
      return true;
    },
    [wantVideo, refreshDevices, emitVideo]
  );

  const toggleMic = useCallback(() => {
    const t = audioTrack.current;
    if (!t) return;
    t.enabled = !t.enabled;
    setMicOn(t.enabled);
    writePrefs({ micOn: t.enabled });
  }, []);

  /**
   * Camera off releases the camera completely (the camera light goes out) and
   * sends a black placeholder; camera on opens it again on the same device.
   */
  const toggleCam = useCallback(async () => {
    const t = cameraTrack.current;
    if (t && t.readyState === 'live' && t.enabled) {
      t.stop();
      cameraTrack.current = null;
      setCamOn(false);
      writePrefs({ camOn: false });
      if (!screenTrack.current) emitVideo();
      else publishPreview();
      return;
    }
    try {
      const deviceId = readPrefs().videoIn;
      const s = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, ...(deviceId ? { deviceId: { ideal: deviceId } } : { facingMode: 'user' }) },
      });
      cameraTrack.current = s.getVideoTracks()[0];
      setHasCamera(true);
      setCamOn(true);
      writePrefs({ camOn: true });
      if (!screenTrack.current) emitVideo();
      else publishPreview();
    } catch (e) {
      setError(mediaErrorMessage(e));
    }
  }, [emitVideo, publishPreview]);

  const switchDevice = useCallback(
    async (kind: 'audioIn' | 'videoIn' | 'audioOut', deviceId: string) => {
      writePrefs({ [kind]: deviceId });
      if (kind === 'audioOut') {
        setSelected((s) => ({ ...s, audioOut: deviceId }));
        return;
      }
      try {
        if (kind === 'audioIn') {
          const s = await navigator.mediaDevices.getUserMedia({
            audio: { deviceId: { exact: deviceId }, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          });
          const t = s.getAudioTracks()[0];
          t.enabled = audioTrack.current?.enabled ?? true;
          audioTrack.current?.stop();
          audioTrack.current = t;
          setHasMic(true);
          onTrackChange.current?.('audio', t);
        } else {
          const s = await navigator.mediaDevices.getUserMedia({
            video: { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } },
          });
          const t = s.getVideoTracks()[0];
          t.enabled = true;
          cameraTrack.current?.stop();
          cameraTrack.current = t;
          setHasCamera(true);
          setCamOn(true);
          writePrefs({ camOn: true });
          if (!screenTrack.current) emitVideo();
          else publishPreview();
        }
        setSelected((sel) => ({ ...sel, [kind]: deviceId }));
        setError('');
      } catch (e) {
        setError(mediaErrorMessage(e));
      }
    },
    [emitVideo, publishPreview]
  );

  const stopShare = useCallback(() => {
    screenTrack.current?.stop();
    screenTrack.current = null;
    setSharing(false);
    emitVideo();
  }, [emitVideo]);

  const startShare = useCallback(async () => {
    if (!wantVideo) return;
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 15 } }, audio: false });
      const t = display.getVideoTracks()[0];
      if (!t) return;
      // Text and slides look sharper when the encoder optimises for detail
      if ('contentHint' in t) t.contentHint = 'detail';
      t.addEventListener('ended', () => {
        if (screenTrack.current === t) stopShare(); // user pressed the browser's "Stop sharing"
      });
      screenTrack.current = t;
      setSharing(true);
      emitVideo();
    } catch (e) {
      const name = (e as { name?: string })?.name;
      if (name !== 'NotAllowedError' && name !== 'AbortError') setError('Screen sharing is not available in this browser.');
    }
  }, [wantVideo, emitVideo, stopShare]);

  const stopAll = useCallback(() => {
    [audioTrack, cameraTrack, screenTrack, placeholder].forEach((r) => {
      r.current?.stop();
      r.current = null;
    });
    setSharing(false);
    setPreview(null);
    setReady(false);
  }, []);

  // Device plugged in / removed
  useEffect(() => {
    const md = navigator.mediaDevices;
    if (!md?.addEventListener) return;
    md.addEventListener('devicechange', refreshDevices);
    return () => md.removeEventListener('devicechange', refreshDevices);
  }, [refreshDevices]);

  useEffect(() => () => stopAll(), [stopAll]);

  return {
    ready,
    error,
    micOn,
    camOn,
    hasMic,
    hasCamera,
    sharing,
    devices,
    selected,
    preview,
    audioTrack: () => audioTrack.current,
    videoTrack: outgoingVideo,
    onTrackChange,
    canShareScreen: typeof navigator !== 'undefined' && !!navigator.mediaDevices && 'getDisplayMedia' in navigator.mediaDevices,
    start,
    toggleMic,
    toggleCam,
    switchDevice,
    startShare,
    stopShare,
    stopAll,
  };
}

export type LocalMedia = ReturnType<typeof useLocalMedia>;
