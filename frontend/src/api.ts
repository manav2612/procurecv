import type { Segment, Session, SessionWithSegments } from "./types";

// No VITE_API_BASE_URL set (production/single-service build has none — see
// Dockerfile) means: talk to whatever origin served this page. That's
// correct for Render, where FastAPI serves both the API and this frontend
// from the same origin (app/main.py's StaticFiles mount) — an empty base
// makes fetch() resolve paths like "/api/sessions" relative to the current
// page, no hardcoded host needed. Local split-service dev (Vite on :5173,
// backend on :8000) still needs the explicit override from .env.example.
export const API_BASE: string = import.meta.env.VITE_API_BASE_URL ?? "";

function defaultWsBase(): string {
  const scheme = window.location.protocol === "https:" ? "wss" : "ws";
  return `${scheme}://${window.location.host}`;
}

// WebSocket() requires an absolute ws(s):// URL — unlike fetch(), a bare
// relative path isn't valid here, so the same-origin case needs deriving
// one from window.location rather than just leaving it blank.
export const WS_BASE: string =
  import.meta.env.VITE_WS_BASE_URL ?? (API_BASE ? API_BASE.replace(/^http/, "ws") : defaultWsBase());

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    throw new Error(`${options?.method ?? "GET"} ${path} failed: ${res.status}`);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

export const api = {
  createSession: (languageHint?: string) =>
    request<Session>("/api/sessions", {
      method: "POST",
      body: JSON.stringify({ language_hint: languageHint || null }),
    }),

  listSessions: () => request<Session[]>("/api/sessions"),

  getSession: (id: number) => request<SessionWithSegments>(`/api/sessions/${id}`),

  updateSession: (id: number, patch: { status?: string; language_hint?: string }) =>
    request<Session>(`/api/sessions/${id}`, {
      method: "PUT",
      body: JSON.stringify(patch),
    }),

  deleteSession: (id: number) => request<void>(`/api/sessions/${id}`, { method: "DELETE" }),

  updateSegment: (id: number, patch: { text?: string }) =>
    request<Segment>(`/api/segments/${id}`, {
      method: "PUT",
      body: JSON.stringify(patch),
    }),

  deleteSegment: (id: number) => request<void>(`/api/segments/${id}`, { method: "DELETE" }),
};
