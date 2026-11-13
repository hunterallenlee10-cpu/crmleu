"use client";

import { useState, useTransition } from "react";
import { editActivity, logActivity } from "../actions";
import { DeleteActivityButton } from "./admin-controls";

// Ctrl/Cmd+Enter saves, Escape cancels.
function shortcuts(save: () => void, cancel: () => void) {
  return (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      save();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  };
}

// A note box at the top of the history. It grows its buttons once you start.
export function AddNote({ leadId }: { leadId: string }) {
  const [body, setBody] = useState("");
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function cancel() {
    setBody("");
    setError("");
    setFocused(false);
  }

  function save() {
    if (!body.trim() || isPending) return;
    setError("");
    startTransition(async () => {
      const result = await logActivity(leadId, "note", body);
      if (result.error) return setError(result.error);
      setBody("");
      setFocused(false);
    });
  }

  const open = focused || body.length > 0;

  return (
    <div className="space-y-2">
      <textarea
        rows={open ? 3 : 1}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => { if (!body.trim()) setFocused(false); }}
        onKeyDown={shortcuts(save, cancel)}
        placeholder="Add a note…"
        aria-label="Add a note"
        className="input resize-y py-2.5 leading-relaxed"
      />
      {open && (
        <div className="flex gap-2 motion-safe:animate-pop-in">
          <button type="button" onClick={save} disabled={isPending || !body.trim()} className="btn btn-primary">
            {isPending ? "Saving…" : "Save note"}
          </button>
          <button type="button" onClick={cancel} disabled={isPending} className="btn btn-ghost">
            Cancel
          </button>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  );
}

// One line of history. Entries you're allowed to edit get an Edit link that
// turns the text into a box you can change in place.
export function HistoryEntry({
  id,
  label,
  meta,
  body,
  edited,
  isNote,
  canEdit,
  canDelete,
}: {
  id: number;
  label: string;
  meta: string;
  body: string | null;
  edited: boolean;
  isNote: boolean;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(body ?? "");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function start() {
    setDraft(body ?? "");
    setError("");
    setEditing(true);
  }

  function cancel() {
    setEditing(false);
    setError("");
  }

  function save() {
    if (isPending) return;
    if (draft.trim() === (body ?? "").trim()) return cancel();
    setError("");
    startTransition(async () => {
      const result = await editActivity(id, draft);
      if (result.error) return setError(result.error);
      setEditing(false);
    });
  }

  return (
    <li className="relative border-l border-line pb-5 pl-5 before:absolute before:top-1.5 before:-left-[4.5px] before:size-2 before:rounded-full before:border before:border-line-strong before:bg-surface-2 last:border-transparent last:pb-0">
      <p className="text-label">
        <span className="font-medium text-fg">{label}</span>
        <span className="text-muted">
          {" · "}
          {meta}
          {edited && " · edited"}
        </span>
        {canEdit && !editing && (
          <button
            type="button"
            onClick={start}
            className="ml-2 rounded-[4px] text-xs text-muted underline-offset-2 transition-colors duration-150 hover:text-fg hover:underline"
          >
            {body ? "Edit" : "Add details"}
          </button>
        )}
        {canDelete && !editing && <DeleteActivityButton activityId={id} />}
      </p>
      {editing ? (
        <div className="mt-2 space-y-2">
          <textarea
            autoFocus
            rows={3}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={shortcuts(save, cancel)}
            onFocus={(e) => e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length)}
            aria-label={`Edit ${label.toLowerCase()}`}
            className="input resize-y py-2.5 leading-relaxed"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={save}
              disabled={isPending || (isNote && !draft.trim())}
              className="btn btn-primary"
            >
              {isPending ? "Saving…" : "Save"}
            </button>
            <button type="button" onClick={cancel} disabled={isPending} className="btn btn-ghost">
              Cancel
            </button>
          </div>
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        </div>
      ) : (
        body && <p className="mt-1 whitespace-pre-wrap">{body}</p>
      )}
    </li>
  );
}
