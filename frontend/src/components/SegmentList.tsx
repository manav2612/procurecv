import { useState } from "react";
import type { Segment } from "../types";

interface Props {
  segments: Segment[];
  loading: boolean;
  onSave: (segmentId: number, text: string) => Promise<void>;
  onDelete: (segmentId: number) => Promise<void>;
}

export function SegmentList({ segments, loading, onSave, onDelete }: Props) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  if (loading) return <p className="hint">Loading segments…</p>;
  if (segments.length === 0) return <p className="hint">No transcript segments yet.</p>;

  const startEdit = (segment: Segment) => {
    setEditingId(segment.id);
    setDraft(segment.text);
  };

  const save = async (id: number) => {
    setBusyId(id);
    try {
      await onSave(id, draft);
      setEditingId(null);
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id: number) => {
    setBusyId(id);
    try {
      await onDelete(id);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      {segments.map((segment) => (
        <div className="segment-row" key={segment.id}>
          {editingId === segment.id ? (
            <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} />
          ) : (
            <p className="segment">
              <span className="ts">
                [{segment.start_ts.toFixed(1)}s–{segment.end_ts.toFixed(1)}s]
              </span>{" "}
              {segment.text}
            </p>
          )}
          <div className="segment-actions">
            {editingId === segment.id ? (
              <>
                <button disabled={busyId === segment.id} onClick={() => save(segment.id)}>
                  Save
                </button>
                <button disabled={busyId === segment.id} onClick={() => setEditingId(null)}>
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button onClick={() => startEdit(segment)}>Edit</button>
                <button
                  className="danger"
                  disabled={busyId === segment.id}
                  onClick={() => remove(segment.id)}
                >
                  Delete
                </button>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
