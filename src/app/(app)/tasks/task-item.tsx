"use client";

import { useCallback, useOptimistic, useState, useTransition } from "react";
import { followUpLabel, formatDateTime } from "@/lib/dates";
import type { Task } from "@/lib/types";
import { deleteTask, setTaskDone } from "./actions";
import { TaskForm, type Assignee } from "./task-form";

// One task with its checkbox. Admins also get Edit and Delete.
export function TaskItem({
  task,
  canCheck,
  isAdmin,
  assignees,
  names,
  today,
  showAssignee = false,
}: {
  task: Task;
  canCheck: boolean;
  isAdmin: boolean;
  assignees: Assignee[];
  names: Record<string, string>;
  today: string;
  showAssignee?: boolean;
}) {
  const [done, setDone] = useOptimistic(task.completed_at !== null);
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
  const dueColor = done || !due ? "text-muted" : due.tone === "overdue" ? "text-danger" : due.tone === "today" ? "text-gold" : "text-muted";
  const assignee = task.assignee_id ? (names[task.assignee_id] ?? "Former member") : "Whole team";

  return (
    <li className={`card flex gap-4 ${done ? "opacity-70" : ""}`}>
      <label className={`-m-2 flex shrink-0 items-start p-2 ${canCheck ? "cursor-pointer" : "cursor-not-allowed"}`}>
        <input
          type="checkbox"
          checked={done}
          disabled={!canCheck || isPending}
          onChange={toggle}
          aria-label={`${done ? "Mark not done" : "Mark done"}: ${task.title}`}
          title={canCheck ? undefined : `Only ${assignee} can tick this off`}
          className="mt-0.5 h-6 w-6 accent-gold disabled:opacity-40"
        />
      </label>
      <div className="min-w-0 flex-1 space-y-1">
        <p className={`font-medium break-words ${done ? "text-muted line-through" : ""}`}>{task.title}</p>
        {task.details && <p className="text-sm whitespace-pre-line break-words text-muted">{task.details}</p>}
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
          {showAssignee && <span className={task.assignee_id ? "" : "text-gold"}>{assignee}</span>}
          {due && <span className={`font-medium ${dueColor}`}>{dueText(due.text, due.tone)}</span>}
          {task.completed_at && done && (
            <span className="text-ok">
              Done{task.completed_by ? ` by ${names[task.completed_by] ?? "a former member"}` : ""} · {formatDateTime(task.completed_at)}
            </span>
          )}
        </p>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      </div>
      {isAdmin && (
        <div className="flex shrink-0 flex-col gap-1 sm:flex-row sm:items-start">
          <button type="button" onClick={() => setEditing(true)} disabled={isPending} className="rounded-lg px-2 py-1.5 text-sm text-muted hover:text-gold">
            Edit
          </button>
          <button type="button" onClick={remove} disabled={isPending} className="rounded-lg px-2 py-1.5 text-sm text-muted hover:text-danger">
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
