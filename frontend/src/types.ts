export type SessionStatus = "active" | "completed";

export interface Segment {
  id: number;
  session_id: number;
  text: string;
  start_ts: number;
  end_ts: number;
  confidence: number | null;
  created_at: string;
}

export interface Session {
  id: number;
  created_at: string;
  status: SessionStatus;
  language_hint: string | null;
}

export interface SessionWithSegments extends Session {
  segments: Segment[];
}
