"use client";

import { useActionState, useEffect, useState } from "react";
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
  const everyone = state?.error ? state.fields?.everyone_must_complete === "on" : (task?.everyone_must_complete ?? false);
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
        <textarea id={id("details")} name="details" rows={2} maxLength={2000} className="input resize-y py-3 leading-relaxed" defaultValue={value("details")} />
      </div>
      <WhoFields
        id={id}
        options={options}
        initialAssignee={value("assignee_id")}
        initialEveryone={everyone}
        dueDate={value("due_date")}
      />
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

// "Assign to", plus the "everyone has to check this off" switch for whole-team tasks.
function WhoFields({
  id,
  options,
  initialAssignee,
  initialEveryone,
  dueDate,
}: {
  id: (name: string) => string;
  options: Assignee[];
  initialAssignee: string;
  initialEveryone: boolean;
  dueDate: string;
}) {
  const [assignee, setAssignee] = useState(initialAssignee);
  const [everyone, setEveryone] = useState(initialEveryone);
  const wholeTeam = assignee === "";

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={id("assignee_id")} className="label">Assign to</label>
          <select id={id("assignee_id")} name="assignee_id" className="input" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
            <option value="">Whole team</option>
            {options.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor={id("due_date")} className="label">Due (optional)</label>
          <input id={id("due_date")} name="due_date" type="date" className="input" defaultValue={dueDate} />
        </div>
      </div>
      {wholeTeam && (
        <>
          <input type="hidden" name="everyone_must_complete" value={everyone ? "on" : ""} />
          <button
            type="button"
            role="switch"
            aria-checked={everyone}
            onClick={() => setEveryone(!everyone)}
            className="flex w-full items-center justify-between gap-4 rounded-xl border border-line bg-field px-4 py-3 text-left transition-colors hover:border-gold/50"
          >
            <span>
              <span className="block font-medium">Everyone has to check this off</span>
              <span className="block text-sm text-muted">
                {everyone
                  ? "Each rep ticks it off for themselves. It's done when every rep has."
                  : "Off: it's done as soon as anyone ticks it."}
              </span>
            </span>
            <span className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${everyone ? "bg-gold shadow-[0_0_14px_-2px_rgb(201_162_74/0.6)]" : "bg-line-strong"}`}>
              <span className={`absolute top-1 size-5 rounded-full bg-fg shadow-sm transition-all ${everyone ? "left-6" : "left-1"}`} />
            </span>
          </button>
        </>
      )}
    </>
  );
}
