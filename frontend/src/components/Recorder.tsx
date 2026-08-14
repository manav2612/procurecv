import { useState } from "react";
import { api, WS_BASE } from "../api";
import { useTranscription } from "../hooks/useTranscription";
import type { Session } from "../types";

export function Recorder() {
  const [session, setSession] = useState<Session | null>(null);
  const [languageHint, setLanguageHint] = useState("");
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const { segments, isRecording, isSpeaking, pendingChunks, error, start, stop } =
    useTranscription(WS_BASE);

  const handleStart = async () => {
    setBusy(true);
    setLocalError(null);
    try {
      const newSession = await api.createSession(languageHint.trim());
      setSession(newSession);
      await start(newSession.id);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleStop = () => {
    stop();
    if (session) {
      api.updateSession(session.id, { status: "completed" }).catch(() => {});
    }
  };

  const statusLabel = !isRecording
    ? null
    : isSpeaking
      ? "Hearing you…"
      : pendingChunks > 0
        ? "Transcribing…"
        : "Listening…";

  return (
    <div className="recorder">
      <h2>Live Transcription</h2>

      <div className="controls">
        <input
          type="text"
          placeholder="Language hint (optional, e.g. hi, en)"
          value={languageHint}
          onChange={(e) => setLanguageHint(e.target.value)}
          disabled={isRecording || busy}
        />
        {!isRecording ? (
          <button onClick={handleStart} disabled={busy}>
            {busy ? "Starting…" : "Start Recording"}
          </button>
        ) : (
          <button onClick={handleStop} className="stop">
            Stop
          </button>
        )}
      </div>

      {session && (
        <p className="session-id">
          Session #{session.id}
          {statusLabel && (
            <>
              {" — "}
              <span className={`status-dot ${isSpeaking ? "speaking" : pendingChunks > 0 ? "busy" : "idle"}`} />
              {statusLabel}
            </>
          )}
        </p>
      )}

      {(error || localError) && <p className="error">{error ?? localError}</p>}

      <div className="transcript">
        {segments.length === 0 && !isRecording && (
          <p className="hint">Press "Start Recording" and speak — transcript segments appear here.</p>
        )}
        {segments.map((seg) => (
          <p key={seg.id} className="segment">
            <span className="ts">
              [{seg.start_ts.toFixed(1)}s–{seg.end_ts.toFixed(1)}s]
            </span>{" "}
            {seg.text}
            {seg.confidence != null && (
              <span className="confidence"> ({Math.round(seg.confidence * 100)}%)</span>
            )}
          </p>
        ))}
      </div>
    </div>
  );
}
