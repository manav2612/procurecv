import type { Segment, Session, SessionWithSegments } from "./types";

export const API_BASE: string = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";
export const WS_BASE: string =
  import.meta.env.VITE_WS_BASE_URL ?? API_BASE.replace(/^http/, "ws");

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
