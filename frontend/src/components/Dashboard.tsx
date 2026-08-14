import { useEffect, useState } from "react";
import { api } from "../api";
import type { Session, SessionWithSegments } from "../types";
import { SegmentList } from "./SegmentList";

export function Dashboard() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<SessionWithSegments | null>(null);
  const [expandedLoading, setExpandedLoading] = useState(false);

  const refresh = () => {
    setLoading(true);
    api
      .listSessions()
      .then(setSessions)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  };

  useEffect(refresh, []);

  const loadExpanded = async (id: number) => {
    setExpandedLoading(true);
    try {
      setExpanded(await api.getSession(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setExpandedLoading(false);
    }
  };

  const toggleExpand = (id: number) => {
    if (expandedId === id) {
      setExpandedId(null);
      setExpanded(null);
      return;
    }
    setExpandedId(id);
    setExpanded(null);
    void loadExpanded(id);
  };

  const handleDeleteSession = async (id: number) => {
    if (!confirm("Delete this session and all its transcript segments?")) return;
    await api.deleteSession(id);
    if (expandedId === id) {
      setExpandedId(null);
      setExpanded(null);
    }
    refresh();
  };

  const filtered = sessions.filter((session) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      String(session.id).includes(q) ||
      (session.language_hint ?? "").toLowerCase().includes(q) ||
      session.status.toLowerCase().includes(q)
    );
  });

  return (
    <div className="dashboard">
      <h2>Transcription History</h2>

      <div className="controls">
        <input
          type="text"
          placeholder="Filter by id, language, or status…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button onClick={refresh}>Refresh</button>
      </div>

      {error && <p className="error">{error}</p>}
      {loading && <p className="hint">Loading…</p>}
      {!loading && filtered.length === 0 && <p className="hint">No sessions yet.</p>}

      <div className="session-list">
        {filtered.map((session) => (
          <div className="session-card" key={session.id}>
            <div className="session-card-header">
              <button onClick={() => toggleExpand(session.id)}>
                {expandedId === session.id ? "▾" : "▸"} Session #{session.id}
              </button>
              <span className="status-badge">{session.status}</span>
              <span className="ts">{new Date(session.created_at).toLocaleString()}</span>
              {session.language_hint && <span className="ts">lang: {session.language_hint}</span>}
              <button className="danger" onClick={() => handleDeleteSession(session.id)}>
                Delete
              </button>
            </div>

            {expandedId === session.id && (
              <SegmentList
                loading={expandedLoading}
                segments={expanded?.segments ?? []}
                onSave={async (segmentId, text) => {
                  await api.updateSegment(segmentId, { text });
                  await loadExpanded(session.id);
                }}
                onDelete={async (segmentId) => {
                  await api.deleteSegment(segmentId);
                  await loadExpanded(session.id);
                }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
