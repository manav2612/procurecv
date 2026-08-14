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

// A segment as streamed live over the WebSocket — a subset of Segment's
// fields (no session_id/created_at, which the WS "final" message omits).
export interface LiveSegment {
  id: number;
  text: string;
  start_ts: number;
  end_ts: number;
  confidence: number | null;
}

export interface WsReadyMessage {
  type: "ready";
  session_id: number;
  language_hint: string | null;
}
export interface WsProcessingMessage {
  type: "processing";
}
export interface WsFinalMessage extends LiveSegment {
  type: "final";
}
export interface WsChunkDoneMessage {
  type: "chunk_done";
  segment_count: number;
}
export interface WsErrorMessage {
  type: "error";
  detail: string;
}
export interface WsPongMessage {
  type: "pong";
}

export type WsMessage =
  | WsReadyMessage
  | WsProcessingMessage
  | WsFinalMessage
  | WsChunkDoneMessage
  | WsErrorMessage
  | WsPongMessage;
