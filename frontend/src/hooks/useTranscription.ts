import { useCallback, useRef, useState } from "react";
import type { Segment } from "../types";

// Each chunk is recorded with its own MediaRecorder instance (started fresh,
// stopped after CHUNK_MS) rather than using a single recorder's `timeslice`
// option. That's deliberate: with one long-lived recorder, only the first
// `dataavailable` blob is a complete, independently-decodable WebM
// container — later ones are headerless fragments. The backend decodes each
// chunk on its own (see backend/app/stt.py), so every chunk sent over the
// wire needs to be a valid file by itself. The tradeoff is a brief
// (tens-of-ms) gap between chunks while one recorder stops and the next
// starts — acceptable for a near-real-time transcript, not true gapless
// streaming.
const CHUNK_MS = 4000;

function pickMimeType(): string | undefined {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

function recordOneChunk(stream: MediaStream, durationMs: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const mimeType = pickMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks: BlobPart[] = [];

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType }));
    recorder.onerror = (event) => reject(event);

    recorder.start();
    setTimeout(() => {
      if (recorder.state !== "inactive") recorder.stop();
    }, durationMs);
  });
}

export function useTranscription(wsBaseUrl: string) {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const stopRequestedRef = useRef(false);

  const recordLoop = useCallback(async (stream: MediaStream, ws: WebSocket) => {
    while (!stopRequestedRef.current && ws.readyState === WebSocket.OPEN) {
      try {
        const blob = await recordOneChunk(stream, CHUNK_MS);
        if (stopRequestedRef.current || ws.readyState !== WebSocket.OPEN) break;
        if (blob.size > 0) {
          ws.send(await blob.arrayBuffer());
        }
      } catch {
        setError("Microphone recording failed");
        break;
      }
    }
  }, []);

  const start = useCallback(
    async (sessionId: number) => {
      setError(null);
      setSegments([]);
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
        const msg = JSON.parse(event.data as string);
        if (msg.type === "final") {
          setSegments((prev) => [...prev, msg as Segment]);
        } else if (msg.type === "error") {
          setError(msg.detail ?? "Transcription error");
        }
      };
      ws.onerror = () => setError("WebSocket connection error");
      ws.onclose = () => setIsRecording(false);
      ws.onopen = () => {
        setIsRecording(true);
        void recordLoop(stream, ws);
      };
    },
    [wsBaseUrl, recordLoop],
  );

  const stop = useCallback(() => {
    stopRequestedRef.current = true;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    wsRef.current?.close();
    wsRef.current = null;
    setIsRecording(false);
  }, []);

  return { segments, isRecording, error, start, stop };
}
