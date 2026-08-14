import { useCallback, useRef, useState } from "react";
import type { LiveSegment, WsMessage } from "../types";

// Voice-activity-detected chunking: instead of blindly recording fixed-length
// chunks on a timer, we watch mic RMS energy (via AnalyserNode) and cut a
// chunk when the speaker pauses — SILENCE_HANG_MS of near-silence after at
// least MIN_CHUNK_MS of recorded audio — or after MAX_CHUNK_MS regardless,
// so a long uninterrupted monologue still streams out periodically. This
// means a short sentence gets sent (and transcribed) almost as soon as you
// stop talking, instead of waiting out a fixed timer — closer to the
// assignment's "real-time" ask than fixed-interval chunking.
//
// Each chunk still gets its own fresh MediaRecorder instance (not one
// recorder's `timeslice`), because only the first timeslice blob from a
// long-lived recorder is a complete, independently-decodable WebM
// container — later ones are headerless fragments, and the backend decodes
// each chunk on its own (see backend/app/stt.py).
//
// Caveat: SPEECH_RMS_THRESHOLD was picked by informed guess, not measured
// against real hardware — this was built in an environment with no
// microphone. Expect to retune it for your mic/room noise floor.
const SPEECH_RMS_THRESHOLD = 0.02;
const SILENCE_HANG_MS = 700;
const MIN_CHUNK_MS = 600;
const MAX_CHUNK_MS = 8000;
const POLL_MS = 100;
const PING_INTERVAL_MS = 20000;

function pickMimeType(): string | undefined {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

function computeRms(analyser: AnalyserNode, buffer: Float32Array<ArrayBuffer>): number {
  analyser.getFloatTimeDomainData(buffer);
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i];
  return Math.sqrt(sum / buffer.length);
}

interface ActiveChunk {
  recorder: MediaRecorder;
  chunks: BlobPart[];
  startedAt: number;
  lastSpeechAt: number;
}

export function useTranscription(wsBaseUrl: string) {
  const [segments, setSegments] = useState<LiveSegment[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [pendingChunks, setPendingChunks] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rmsBufferRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const activeChunkRef = useRef<ActiveChunk | null>(null);
  const pollIntervalRef = useRef<number | null>(null);
  const pingIntervalRef = useRef<number | null>(null);
  const stopRequestedRef = useRef(false);

  const sendChunk = useCallback((ws: WebSocket, active: ActiveChunk) => {
    const blob = new Blob(active.chunks, { type: active.recorder.mimeType });
    if (blob.size === 0) return;
    setPendingChunks((n) => n + 1);
    void blob.arrayBuffer().then((buf) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(buf);
    });
  }, []);

  const beginChunk = useCallback((stream: MediaStream, now: number) => {
    const mimeType = pickMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.start();
    activeChunkRef.current = { recorder, chunks, startedAt: now, lastSpeechAt: now };
  }, []);

  const endChunk = useCallback(
    (ws: WebSocket) => {
      const active = activeChunkRef.current;
      if (!active) return;
      activeChunkRef.current = null;
      if (active.recorder.state === "inactive") {
        sendChunk(ws, active);
      } else {
        active.recorder.onstop = () => sendChunk(ws, active);
        active.recorder.stop();
      }
    },
    [sendChunk],
  );

  const startVadLoop = useCallback(
    (stream: MediaStream, ws: WebSocket) => {
      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      audioCtxRef.current = audioCtx;
      analyserRef.current = analyser;
      rmsBufferRef.current = new Float32Array(analyser.fftSize);

      pollIntervalRef.current = window.setInterval(() => {
        if (stopRequestedRef.current || !analyserRef.current || !rmsBufferRef.current) return;

        const rms = computeRms(analyserRef.current, rmsBufferRef.current);
        const speaking = rms > SPEECH_RMS_THRESHOLD;
        setIsSpeaking(speaking);

        const now = performance.now();
        const active = activeChunkRef.current;

        if (!active) {
          if (speaking) beginChunk(stream, now);
          return;
        }

        if (speaking) active.lastSpeechAt = now;
        const chunkElapsed = now - active.startedAt;
        const silenceElapsed = now - active.lastSpeechAt;
        const pastMinAndSilent = chunkElapsed >= MIN_CHUNK_MS && silenceElapsed >= SILENCE_HANG_MS;
        const pastMax = chunkElapsed >= MAX_CHUNK_MS;
        if (pastMinAndSilent || pastMax) endChunk(ws);
      }, POLL_MS);

      pingIntervalRef.current = window.setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "ping" }));
      }, PING_INTERVAL_MS);
    },
    [beginChunk, endChunk],
  );

  const start = useCallback(
    async (sessionId: number) => {
      setError(null);
      setSegments([]);
      setPendingChunks(0);
      stopRequestedRef.current = false;

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        setError("Microphone permission denied or unavailable");
        return;
      }
      streamRef.current = stream;

      const ws = new WebSocket(`${wsBaseUrl}/ws/transcribe/${sessionId}`);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data as string) as WsMessage;
        switch (msg.type) {
          case "ready":
            // Only start capturing once the server has confirmed the
            // session is valid and it's listening — avoids racing audio
            // against a connection that's about to be rejected.
            setIsRecording(true);
            startVadLoop(stream, ws);
            break;
          case "final":
            setSegments((prev) => [...prev, msg]);
            break;
          case "chunk_done":
            setPendingChunks((n) => Math.max(0, n - 1));
            break;
          case "error":
            setError(msg.detail);
            break;
          case "processing":
          case "pong":
            break;
        }
      };
      ws.onerror = () => setError("WebSocket connection error");
      ws.onclose = () => {
        setIsRecording(false);
        setIsSpeaking(false);
      };
    },
    [wsBaseUrl, startVadLoop],
  );

  const stop = useCallback(() => {
    stopRequestedRef.current = true;
    if (pollIntervalRef.current != null) window.clearInterval(pollIntervalRef.current);
    if (pingIntervalRef.current != null) window.clearInterval(pingIntervalRef.current);
    pollIntervalRef.current = null;
    pingIntervalRef.current = null;

    const ws = wsRef.current;
    if (ws && activeChunkRef.current) endChunk(ws);

    audioCtxRef.current?.close();
    audioCtxRef.current = null;
    analyserRef.current = null;

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    // Give the last in-flight chunk a moment to reach the socket before
    // sending "stop" and closing, so it isn't dropped mid-send.
    window.setTimeout(() => {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "stop" }));
        ws.close();
      }
    }, 300);
    wsRef.current = null;

    setIsRecording(false);
    setIsSpeaking(false);
  }, [endChunk]);

  return { segments, isRecording, isSpeaking, pendingChunks, error, start, stop };
}
