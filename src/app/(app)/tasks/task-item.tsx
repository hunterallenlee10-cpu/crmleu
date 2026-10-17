"use client";

import { Check, Circle } from "lucide-react";
import { useCallback, useOptimistic, useState, useTransition } from "react";
import { followUpLabel, formatDateTime } from "@/lib/dates";
import type { EveryoneProgress, Task } from "@/lib/types";
import { deleteTask, setTaskDone } from "./actions";
import { TaskForm, type Assignee } from "./task-form";

// One task with its checkbox. Admins also get Edit and Delete.
// "Everyone" tasks pass `progress` and `meId`: the checkbox is your own tick,
// and the row lists which reps have ticked it.
export function TaskItem({
  task,
  canCheck: canCheckPlain,
  progress = [],
  meId,
  isAdmin,
  assignees,
  names,
  today,
  showAssignee = false,
}: {
  task: Task;
  canCheck: boolean;
  progress?: EveryoneProgress[];
  meId?: string;
  isAdmin: boolean;
  assignees: Assignee[];
  names: Record<string, string>;
  today: string;
  showAssignee?: boolean;
}) {
  const everyone = task.everyone_must_complete;
  const mine = everyone ? progress.find((p) => p.user_id === meId) : undefined;
  const canCheck = everyone ? mine !== undefined : canCheckPlain;
  const [done, setDone] = useOptimistic(mine ? mine.checked_at !== null : task.completed_at !== null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const stopEditing = useCallback(() => setEditing(false), []);

  function toggle() {
    setError("");
    startTransition(async () => {
      setDone(!done);
      const res = await setTaskDone(task.id, !done);
      if (res.error) setError(res.error);
    });
  }

  function remove() {
    if (!confirm(`Delete "${task.title}"? This can't be undone.`)) return;
    setError("");
    startTransition(async () => {
      const res = await deleteTask(task.id);
      if (res.error) setError(res.error);
    });
  }

  if (editing) {
    return (
      <li className="card">
        <TaskForm
          assignees={assignees}
          task={task}
          assigneeName={task.assignee_id ? names[task.assignee_id] : undefined}
          onDone={stopEditing}
        />
      </li>
    );
  }

  const due = task.due_date ? followUpLabel(task.due_date, today) : null;
  const dueColor = done || !due ? "text-muted" : due.tone === "overdue" ? "text-danger" : due.tone === "today" ? "text-warning" : "text-muted";
  const assignee = task.assignee_id ? (names[task.assignee_id] ?? "Former member") : "Whole team";
  const lockedReason = everyone ? "Each rep ticks this off for themselves" : `Only ${assignee} can tick this off`;
  // My own chip follows the checkbox right away; the rest come from the server.
  const ticked = (p: EveryoneProgress) => (p.user_id === meId ? done : p.checked_at !== null);
  const tickedCount = progress.filter(ticked).length;

  return (
    <li className={`flex gap-3 rounded-card border border-line bg-surface px-4 py-3.5 transition-opacity duration-150 sm:px-5 ${done ? "opacity-60" : ""}`}>
      <label className={`-m-2 flex shrink-0 items-start p-2 ${canCheck ? "cursor-pointer" : "cursor-not-allowed"}`}>
        <input
          type="checkbox"
          checked={done}
          disabled={!canCheck || isPending}
          onChange={toggle}
          aria-label={`${done ? "Mark not done" : "Mark done"}: ${task.title}`}
          title={canCheck ? undefined : lockedReason}
          className="mt-0.5 size-[18px] disabled:opacity-40"
        />
      </label>
      <div className="min-w-0 flex-1 space-y-1">
        <p className={`font-medium break-words ${done ? "text-muted line-through" : ""}`}>{task.title}</p>
        {task.details && <p className="text-label whitespace-pre-line break-words text-muted">{task.details}</p>}
        <p className="flex flex-wrap gap-x-3 gap-y-1 pt-0.5 text-xs text-muted">
          {showAssignee && <span className={task.assignee_id ? "" : "font-medium text-fg"}>{assignee}</span>}
          {everyone && (
            <span className="font-medium text-info">
              Everyone checks off · {tickedCount} of {progress.length} done
            </span>
          )}
          {due && <span className={`font-medium ${dueColor}`}>{dueText(due.text, due.tone)}</span>}
          {task.completed_at && (everyone ? (
            <span className="text-success">Everyone&apos;s done · {formatDateTime(task.completed_at)}</span>
          ) : done && (
            <span className="text-success">
              Done{task.completed_by ? ` by ${names[task.completed_by] ?? "a former member"}` : ""} · {formatDateTime(task.completed_at)}
            </span>
          ))}
        </p>
        {everyone && progress.length > 0 && (
          <ul className="flex flex-wrap gap-1.5 pt-1" aria-label="Who has checked it off">
            {progress.map((p) => (
              <li
                key={p.user_id}
                title={p.checked_at && ticked(p) ? `Checked off ${formatDateTime(p.checked_at)}` : undefined}
                className={`pill ${ticked(p) ? "pill-success" : "pill-neutral"}`}
              >
                {ticked(p) ? (
                  <Check aria-label="Checked off" className="size-3" strokeWidth={2.25} />
                ) : (
                  <Circle aria-label="Not yet" className="size-3" strokeWidth={2} />
                )}{" "}
                {p.full_name}
              </li>
            ))}
          </ul>
        )}
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      </div>
      {isAdmin && (
        <div className="flex shrink-0 flex-col gap-1 sm:flex-row sm:items-start">
          <button type="button" onClick={() => setEditing(true)} disabled={isPending} className="btn btn-ghost min-h-9 px-2.5 text-label sm:min-h-8">
            Edit
          </button>
          <button type="button" onClick={remove} disabled={isPending} className="btn btn-ghost min-h-9 px-2.5 text-label hover:bg-danger/[0.1] hover:text-danger sm:min-h-8">
            Delete
          </button>
        </div>
      )}
    </li>
  );
}

// "Overdue 3d" / "Due today" / "Due tomorrow" / "Due Oct 12"
function dueText(text: string, tone: "overdue" | "today" | "upcoming") {
  if (tone === "overdue") return text;
  return `Due ${tone === "today" || text === "Tomorrow" ? text.toLowerCase() : text}`;
}
