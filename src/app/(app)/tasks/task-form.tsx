"use client";

import { useActionState, useEffect } from "react";
import { FormMessage } from "@/components/form-message";
import type { Task } from "@/lib/types";
import { createTask, updateTask } from "./actions";

export type Assignee = { id: string; name: string };

// Admin only: add a task, or edit one when `task` is passed.
export function TaskForm({
  assignees,
  task,
  assigneeName,
  onDone,
}: {
  assignees: Assignee[];
  task?: Task;
  assigneeName?: string;
  onDone?: () => void;
}) {
  const [state, action, pending] = useActionState(task ? updateTask.bind(null, task.id) : createTask, undefined);

  useEffect(() => {
    if (state?.message) onDone?.();
  }, [state, onDone]);

  // After an error, show what was typed; otherwise the task's saved values (or blanks).
  const value = (name: "title" | "details" | "assignee_id" | "due_date") =>
    state?.error ? (state.fields?.[name] ?? "") : (task?.[name] ?? "");
  const id = (name: string) => `${name}-${task?.id ?? "new"}`;
  const key = state?.error ? JSON.stringify(state.fields) : "saved";

  // Keep an inactive person selectable on tasks already assigned to them.
  const options =
    task?.assignee_id && !assignees.some((a) => a.id === task.assignee_id)
      ? [...assignees, { id: task.assignee_id, name: `${assigneeName ?? "Former member"} (inactive)` }]
      : assignees;

  return (
    <form action={action} className="space-y-4" key={key}>
      <div>
        <label htmlFor={id("title")} className="label">Task</label>
        <input id={id("title")} name="title" required maxLength={200} className="input" defaultValue={value("title")} placeholder="What needs doing?" />
      </div>
      <div>
        <label htmlFor={id("details")} className="label">Details (optional)</label>
        <textarea id={id("details")} name="details" rows={2} maxLength={2000} className="input py-3" defaultValue={value("details")} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={id("assignee_id")} className="label">Assign to</label>
          <select id={id("assignee_id")} name="assignee_id" className="input" defaultValue={value("assignee_id")}>
            <option value="">Whole team</option>
            {options.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor={id("due_date")} className="label">Due (optional)</label>
          <input id={id("due_date")} name="due_date" type="date" className="input" defaultValue={value("due_date")} />
        </div>
      </div>
      <FormMessage state={task ? (state?.error ? state : undefined) : state} />
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className="btn btn-gold w-full sm:w-auto">
          {pending ? "Saving…" : task ? "Save task" : "Add task"}
        </button>
        {onDone && (
          <button type="button" onClick={onDone} className="btn btn-ghost w-full sm:w-auto">Cancel</button>
        )}
      </div>
    </form>
  );
}
