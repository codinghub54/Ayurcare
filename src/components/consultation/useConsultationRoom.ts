'use client';

/**
 * Consultation room client: sync loop, chat and a 1-to-1 WebRTC call.
 *
 * Signalling goes through the database (POST /signal, delivered by /sync), so it
 * works on serverless hosting. The doctor's browser always makes the offer and
 * the patient's browser answers. Every peer connection the doctor builds gets a
 * session id; messages from an older session are ignored, so re-joins and
 * reconnects never mix up offers.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export type ConsultType = 'VIDEO' | 'AUDIO' | 'CHAT';
export type CallState = 'idle' | 'starting' | 'waiting' | 'connecting' | 'connected' | 'reconnecting' | 'error';

export interface MedicineItem {
  name: string;
  dosage: string;
  frequency: string;
  timing: string;
  anupana: string;
  duration: string;
  notes: string;
}

export interface Report {
  diagnosis: string;
  notes: string;
  dietInstructions: string;
  lifestyleAdvice: string;
  medicines: MedicineItem[];
  privateDoctorNotes?: string;
  status: 'DRAFT' | 'FINAL' | 'EMPTY';
  updatedAt: string | null;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderRole: 'DOCTOR' | 'PATIENT' | 'SYSTEM';
  body: string;
  createdAt: string;
  pending?: boolean;
}

export interface PreviousVisit {
  id: string;
  date: string;
  type: string;
  doctorName: string;
  withMe: boolean;
  diagnosis: string;
  notes: string;
  privateNotes?: string;
  medicines: string[];
}

export interface RoomData {
  appointment: {
    id: string;
    type: ConsultType;
    status: string;
    scheduledAt: string;
    doctor: { id: string; name: string; qualification: string; specializations: string };
    patient: { id: string; name: string };
  };
  me: { id: string; name: string; role: 'DOCTOR' | 'PATIENT' };
  peerId: string;
  window: { opensAt: string; closesAt: string; isOpen: boolean };
  iceServers: RTCIceServer[];
  report: Report;
  patientContext?: {
    name: string;
    forFamilyMember: { relation: string; bookedBy: string } | null;
    age: number | null;
    gender: string | null;
    bloodGroup: string | null;
    prakriti: string | null;
    allergies: string | null;
    chronicConditions: string | null;
    labReports: { id: string; description: string | null; uploadedAt: string; uploadedBy: string }[];
    previousVisits: PreviousVisit[];
  };
}

const newSession = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now() + Math.random()));

export function useConsultationRoom(appointmentId: string) {
  const [data, setData] = useState<RoomData | null>(null);
  const [loadError, setLoadError] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [peer, setPeer] = useState({ present: false, inCall: false });
  const [status, setStatus] = useState<string>('');
  const [windowOpen, setWindowOpen] = useState(false);
  const [liveReport, setLiveReport] = useState<Report | null>(null);
  const [connectionLost, setConnectionLost] = useState(false);

  const [callState, setCallState] = useState<CallState>('idle');
  const [callError, setCallError] = useState('');
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);

  const dataRef = useRef<RoomData | null>(null);
  const inCallRef = useRef(false);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localRef = useRef<MediaStream | null>(null);
  const sessionRef = useRef<string | null>(null);
  const pendingIce = useRef<RTCIceCandidateInit[]>([]);
  const lastMsgAt = useRef<string | null>(null);
  const peerRef = useRef(peer);
  const stopped = useRef(false);

  const isDoctor = () => dataRef.current?.me.role === 'DOCTOR';

  /* ---------------- signalling ---------------- */

  const sendSignal = useCallback(
    async (kind: 'hello' | 'description' | 'candidate' | 'bye', payload: unknown, reset = false) => {
      try {
        await fetch(`/api/consultations/${appointmentId}/signal`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind, payload: JSON.stringify(payload ?? {}), reset }),
          keepalive: kind === 'bye',
        });
      } catch {
        /* the next sync/heartbeat will recover */
      }
    },
    [appointmentId]
  );

  const closePc = useCallback(() => {
    const pc = pcRef.current;
    pcRef.current = null;
    pendingIce.current = [];
    if (pc) {
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.onconnectionstatechange = null;
      try {
        pc.close();
      } catch {}
    }
    setRemoteStream(null);
  }, []);

  const buildPc = useCallback(
    (session: string) => {
      closePc();
      sessionRef.current = session;
      const pc = new RTCPeerConnection({ iceServers: dataRef.current?.iceServers || [] });
      pcRef.current = pc;

      localRef.current?.getTracks().forEach((t) => pc.addTrack(t, localRef.current!));
      // Make sure we can receive media even if we are not sending that kind
      const type = dataRef.current?.appointment.type;
      if (isDoctor()) {
        if (!localRef.current?.getAudioTracks().length) pc.addTransceiver('audio', { direction: 'recvonly' });
        if (type === 'VIDEO' && !localRef.current?.getVideoTracks().length) pc.addTransceiver('video', { direction: 'recvonly' });
      }

      const remote = new MediaStream();
      pc.ontrack = (ev) => {
        ev.streams[0]?.getTracks().forEach((t) => remote.addTrack(t));
        if (!ev.streams[0]) remote.addTrack(ev.track);
        setRemoteStream(new MediaStream(remote.getTracks()));
      };
      pc.onicecandidate = (ev) => {
        if (ev.candidate) sendSignal('candidate', { session, candidate: ev.candidate.toJSON() });
      };
      pc.onconnectionstatechange = () => {
        if (pcRef.current !== pc) return;
        const s = pc.connectionState;
        if (s === 'connected') setCallState('connected');
        else if (s === 'connecting' || s === 'new') setCallState((c) => (c === 'connected' ? 'reconnecting' : 'connecting'));
        else if (s === 'disconnected') setCallState('reconnecting');
        else if (s === 'failed') {
          setCallState('reconnecting');
          // Doctor restarts ICE on the same connection; patient asks the doctor for a fresh one
          if (isDoctor()) {
            pc.createOffer({ iceRestart: true })
              .then((o) => pc.setLocalDescription(o))
              .then(() => sendSignal('description', { session, sdp: pc.localDescription }))
              .catch(() => {});
          } else {
            sendSignal('hello', {});
          }
        }
      };
      return pc;
    },
    [closePc, sendSignal]
  );

  const doctorOffer = useCallback(async () => {
    const session = newSession();
    const pc = buildPc(session);
    setCallState('connecting');
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await sendSignal('description', { session, sdp: pc.localDescription });
  }, [buildPc, sendSignal]);

  const flushIce = async (pc: RTCPeerConnection) => {
    const queued = pendingIce.current;
    pendingIce.current = [];
    for (const c of queued) {
      try {
        await pc.addIceCandidate(c);
      } catch {}
    }
  };

  const handleSignal = useCallback(
    async (kind: string, raw: string) => {
      let payload: { session?: string; sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit } = {};
      try {
        payload = JSON.parse(raw || '{}');
      } catch {
        return;
      }
      if (!inCallRef.current) return;
      const doctor = isDoctor();

      if (kind === 'bye') {
        closePc();
        sessionRef.current = null;
        setCallState('waiting');
        return;
      }

      if (kind === 'hello') {
        // The other side (re)joined: the doctor starts a fresh connection
        if (doctor) await doctorOffer();
        else if (payload.session && payload.session !== sessionRef.current) {
          buildPc(payload.session);
          setCallState('connecting');
        }
        return;
      }

      if (kind === 'description' && payload.sdp) {
        if (!doctor && payload.sdp.type === 'offer') {
          // A new session means the doctor rebuilt their connection: rebuild ours too
          let pc = pcRef.current;
          if (!pc || payload.session !== sessionRef.current) pc = buildPc(payload.session || newSession());
          await pc.setRemoteDescription(payload.sdp);
          await flushIce(pc);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await sendSignal('description', { session: payload.session, sdp: pc.localDescription });
          setCallState((c) => (c === 'connected' ? c : 'connecting'));
        } else if (doctor && payload.sdp.type === 'answer') {
          const pc = pcRef.current;
          if (!pc || payload.session !== sessionRef.current || pc.signalingState !== 'have-local-offer') return;
          await pc.setRemoteDescription(payload.sdp);
          await flushIce(pc);
        }
        return;
      }

      if (kind === 'candidate' && payload.candidate) {
        const pc = pcRef.current;
        if (!pc || payload.session !== sessionRef.current) return;
        if (pc.remoteDescription) {
          try {
            await pc.addIceCandidate(payload.candidate);
          } catch {}
        } else {
          pendingIce.current.push(payload.candidate);
        }
      }
    },
    [buildPc, closePc, doctorOffer, sendSignal]
  );

  /* ---------------- bootstrap + sync loop ---------------- */

  useEffect(() => {
    stopped.current = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const mergeMessages = (incoming: ChatMessage[]) => {
      if (!incoming.length) return;
      setMessages((prev) => {
        const byId = new Map(prev.filter((m) => !m.pending).map((m) => [m.id, m]));
        incoming.forEach((m) => byId.set(m.id, m));
        const pendings = prev.filter((m) => m.pending && !incoming.some((i) => i.body === m.body && i.senderId === m.senderId));
        return [...byId.values(), ...pendings].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      });
      lastMsgAt.current = incoming[incoming.length - 1].createdAt;
    };

    const tick = async () => {
      if (stopped.current) return;
      try {
        const res = await fetch(`/api/consultations/${appointmentId}/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ after: lastMsgAt.current, inCall: inCallRef.current }),
        });
        if (res.ok) {
          const s = await res.json();
          setConnectionLost(false);
          setStatus(s.status);
          setWindowOpen(!!s.window?.isOpen);
          const wasInCall = peerRef.current.inCall;
          peerRef.current = s.peer;
          setPeer(s.peer);
          if (s.report) setLiveReport(s.report);
          mergeMessages(s.messages || []);
          for (const sig of s.signals || []) {
            await handleSignal(sig.kind, sig.payload);
          }
          // The patient vanished without saying goodbye (closed tab, lost network)
          if (inCallRef.current && wasInCall && !s.peer.inCall) {
            closePc();
            setCallState('waiting');
          }
          // Doctor: the patient is in the call but we have no connection yet
          if (inCallRef.current && isDoctor() && s.peer.inCall && !pcRef.current) {
            await doctorOffer();
          }
        } else {
          setConnectionLost(true);
        }
      } catch {
        setConnectionLost(true);
      }
      if (stopped.current) return;
      const delay = inCallRef.current ? 1000 : document.hidden ? 6000 : 2500;
      timer = setTimeout(tick, delay);
    };

    (async () => {
      try {
        const res = await fetch(`/api/consultations/${appointmentId}`);
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          setLoadError(json.error || 'Could not open this consultation.');
          return;
        }
        dataRef.current = json;
        setData(json);
        setStatus(json.appointment.status);
        setWindowOpen(json.window.isOpen);
        if (json.me.role === 'PATIENT') setLiveReport(json.report);
        tick();
      } catch {
        setLoadError('Could not reach the server. Please check your connection.');
      }
    })();

    return () => {
      stopped.current = true;
      if (timer) clearTimeout(timer);
    };
  }, [appointmentId, closePc, doctorOffer, handleSignal]);

  /* ---------------- call controls ---------------- */

  const joinCall = useCallback(async () => {
    const d = dataRef.current;
    if (!d || d.appointment.type === 'CHAT') return;
    setCallError('');
    setCallState('starting');
    try {
      const wantVideo = d.appointment.type === 'VIDEO';
      const audio = { echoCancellation: true, noiseSuppression: true };
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio,
          video: wantVideo ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } : false,
        });
      } catch (err) {
        // No usable camera: join a video consultation with audio only rather than not at all
        const name = (err as { name?: string })?.name;
        if (!wantVideo || name === 'NotAllowedError') throw err;
        stream = await navigator.mediaDevices.getUserMedia({ audio });
        setCallError('Your camera is not available, so you joined with audio only.');
      }
      localRef.current = stream;
      setLocalStream(stream);
      setMicOn(true);
      setCamOn(stream.getVideoTracks().length > 0);
      inCallRef.current = true;
      setCallState('waiting');

      if (d.me.role === 'DOCTOR') {
        const session = newSession();
        sessionRef.current = session;
        await sendSignal('hello', { session }, true);
        if (peerRef.current.inCall) await doctorOffer();
      } else {
        closePc();
        sessionRef.current = null;
        await sendSignal('hello', {}, true);
      }
    } catch (e) {
      inCallRef.current = false;
      setCallState('error');
      const name = (e as { name?: string })?.name;
      setCallError(
        name === 'NotAllowedError'
          ? 'Camera or microphone permission was blocked. Allow it in your browser settings and try again.'
          : name === 'NotFoundError'
            ? 'No camera or microphone was found on this device.'
            : 'Could not start your camera or microphone.'
      );
    }
  }, [closePc, doctorOffer, sendSignal]);

  const leaveCall = useCallback(() => {
    if (inCallRef.current) sendSignal('bye', {});
    inCallRef.current = false;
    closePc();
    sessionRef.current = null;
    localRef.current?.getTracks().forEach((t) => t.stop());
    localRef.current = null;
    setLocalStream(null);
    setCallState('idle');
  }, [closePc, sendSignal]);

  const toggleMic = useCallback(() => {
    const track = localRef.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setMicOn(track.enabled);
  }, []);

  const toggleCam = useCallback(() => {
    const track = localRef.current?.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setCamOn(track.enabled);
  }, []);

  // Leave cleanly when the page closes or the component unmounts
  useEffect(() => {
    const onUnload = () => {
      if (inCallRef.current) sendSignal('bye', {});
    };
    window.addEventListener('pagehide', onUnload);
    return () => {
      window.removeEventListener('pagehide', onUnload);
      if (inCallRef.current) sendSignal('bye', {});
      inCallRef.current = false;
      localRef.current?.getTracks().forEach((t) => t.stop());
      pcRef.current?.close();
    };
  }, [sendSignal]);

  /* ---------------- chat ---------------- */

  const sendMessage = useCallback(
    async (body: string) => {
      const text = body.trim();
      const d = dataRef.current;
      if (!text || !d) return { ok: false as const };
      const temp: ChatMessage = {
        id: `pending-${Date.now()}`,
        senderId: d.me.id,
        senderRole: d.me.role,
        body: text,
        createdAt: new Date().toISOString(),
        pending: true,
      };
      setMessages((m) => [...m, temp]);
      try {
        const res = await fetch(`/api/consultations/${appointmentId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body: text }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          setMessages((m) => m.filter((x) => x.id !== temp.id));
          return { ok: false as const, error: json.error || 'Message could not be sent.' };
        }
        setMessages((m) =>
          [...m.filter((x) => x.id !== temp.id && x.id !== json.message.id), json.message].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        );
        return { ok: true as const };
      } catch {
        setMessages((m) => m.filter((x) => x.id !== temp.id));
        return { ok: false as const, error: 'Could not reach the server.' };
      }
    },
    [appointmentId]
  );

  return {
    data,
    loadError,
    status,
    windowOpen,
    peer,
    messages,
    liveReport,
    connectionLost,
    call: { state: callState, error: callError, localStream, remoteStream, micOn, camOn, join: joinCall, leave: leaveCall, toggleMic, toggleCam },
    sendMessage,
  };
}
