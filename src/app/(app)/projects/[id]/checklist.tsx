"use client";

import { useOptimistic, useState, useTransition } from "react";
import { addTasks, deleteTask, renameTask, setTaskDone } from "../actions";

export type ChecklistItem = { id: number; title: string; done: boolean; doneNote: string | null };

// The assignee and admins tick items off. Admins can also add, rename and
// remove items.
export function Checklist({
  projectId,
  items,
  isAdmin,
}: {
  projectId: string;
  items: ChecklistItem[];
  isAdmin: boolean;
}) {
  const [optimistic, setOptimistic] = useOptimistic(
    items,
    (state, change: { id: number; done: boolean }) =>
      state.map((i) => (i.id === change.id ? { ...i, done: change.done, doneNote: change.done ? i.doneNote : null } : i)),
  );
  const [error, setError] = useState("");
  const [, startTransition] = useTransition();

  function toggle(item: ChecklistItem) {
    setError("");
    startTransition(async () => {
      setOptimistic({ id: item.id, done: !item.done });
      const res = await setTaskDone(item.id, !item.done);
      if (res.error) setError(res.error);
    });
  }

  return (
    <div className="space-y-4">
      {optimistic.length === 0 ? (
        <p className="text-sm text-muted">
          {isAdmin ? "No items yet. Add the first one below." : "No items on this checklist yet."}
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {optimistic.map((item) => (
            <ChecklistRow key={item.id} item={item} isAdmin={isAdmin} onToggle={() => toggle(item)} onError={setError} />
          ))}
        </ul>
      )}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {isAdmin && <AddItems projectId={projectId} />}
    </div>
  );
}

function ChecklistRow({
  item,
  isAdmin,
  onToggle,
  onError,
}: {
  item: ChecklistItem;
  isAdmin: boolean;
  onToggle: () => void;
  onError: (message: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(item.title);
  const [isPending, startTransition] = useTransition();

  function save() {
    if (title.trim() === item.title) return setEditing(false);
    startTransition(async () => {
      const res = await renameTask(item.id, title);
      if (res.error) onError(res.error);
      else setEditing(false);
    });
  }

  function remove() {
    if (!confirm(`Remove "${item.title}" from the checklist?`)) return;
    startTransition(async () => {
      const res = await deleteTask(item.id);
      if (res.error) onError(res.error);
    });
  }

  if (editing) {
    return (
      <li className="flex flex-col gap-2 py-3 sm:flex-row">
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") { setTitle(item.title); setEditing(false); }
          }}
          aria-label="Item"
          className="input"
          maxLength={300}
        />
        <div className="flex gap-2">
          <button type="button" className="btn btn-gold flex-1 sm:flex-none" disabled={isPending} onClick={save}>Save</button>
          <button type="button" className="btn btn-ghost flex-1 sm:flex-none" onClick={() => { setTitle(item.title); setEditing(false); }}>Cancel</button>
        </div>
      </li>
    );
  }

  return (
    <li className="flex items-start gap-3 py-1">
      <label className="flex min-h-12 flex-1 cursor-pointer items-start gap-3 py-2.5">
        <input
          type="checkbox"
          checked={item.done}
          onChange={onToggle}
          className="mt-0.5 size-5 shrink-0 cursor-pointer accent-gold"
        />
        <span className="min-w-0">
          <span className={`block break-words ${item.done ? "text-muted line-through" : ""}`}>{item.title}</span>
          {item.doneNote && <span className="mt-0.5 block text-xs text-ok/80">Done by {item.doneNote}</span>}
        </span>
      </label>
      {isAdmin && (
        <div className="flex shrink-0 items-center gap-1 pt-2">
          <button type="button" onClick={() => setEditing(true)} className="rounded-lg px-2 py-1.5 text-xs text-muted hover:text-gold">
            Edit
          </button>
          <button type="button" onClick={remove} disabled={isPending} className="rounded-lg px-2 py-1.5 text-xs text-muted hover:text-danger">
            Remove
          </button>
        </div>
      )}
    </li>
  );
}

function AddItems({ projectId }: { projectId: string }) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function add() {
    setError("");
    startTransition(async () => {
      const res = await addTasks(projectId, text);
      if (res.error) setError(res.error);
      else setText("");
    });
  }

  return (
    <div className="space-y-2 border-t border-line pt-4">
      <label htmlFor="new-items" className="label">Add items</label>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <textarea
          id="new-items"
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (text.trim()) add();
            }
          }}
          placeholder="New item"
          className="input py-3"
        />
        <button type="button" className="btn btn-ghost" disabled={isPending || !text.trim()} onClick={add}>
          {isPending ? "Adding…" : "Add"}
        </button>
      </div>
      <p className="text-xs text-muted">Paste several lines to add several items at once.</p>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  );
}
