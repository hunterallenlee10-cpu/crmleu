"use client";

import { useActionState, useEffect, useState } from "react";
import { FormMessage } from "@/components/form-message";
import { SwitchRow } from "@/components/switch-row";
import type { Task } from "@/lib/types";
import { createTask, updateTask } from "./actions";

export type Assignee = { id: string; name: string };
export type VentureOption = { id: string; name: string };

// Admin only: add a task, or edit one when `task` is passed.
export function TaskForm({
  assignees,
  ventures,
  task,
  assigneeName,
  onDone,
}: {
  assignees: Assignee[];
  ventures?: VentureOption[];
  task?: Task;
  assigneeName?: string;
  onDone?: () => void;
}) {
  const [state, action, pending] = useActionState(task ? updateTask.bind(null, task.id) : createTask, undefined);

  useEffect(() => {
    if (state?.message) onDone?.();
  }, [state, onDone]);

  // After an error, show what was typed; otherwise the task's saved values (or blanks).
  const value = (name: "title" | "details" | "assignee_id" | "due_date" | "venture_id") =>
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
      {ventures ? (
        <div>
          <label htmlFor={id("venture_id")} className="label">Venture (optional)</label>
          <select id={id("venture_id")} name="venture_id" className="input" defaultValue={value("venture_id")}>
            <option value="">No venture</option>
            {ventures.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </div>
      ) : (
        // Without the list, keep whatever venture the task already has.
        <input type="hidden" name="venture_id" value={value("venture_id")} />
      )}
      <WhoFields
        id={id}
        options={options}
        initialAssignee={value("assignee_id")}
        initialEveryone={everyone}
        dueDate={value("due_date")}
      />
      <FormMessage state={task ? (state?.error ? state : undefined) : state} />
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className="btn btn-primary w-full sm:w-auto">
          {pending ? "Saving…" : task ? "Save task" : "Add task"}
        </button>
        {onDone && (
          <button type="button" onClick={onDone} className="btn btn-secondary w-full sm:w-auto">Cancel</button>
        )}
      </div>
    </form>
  );
}

// "Assign to", the "everyone has to check this off" switch for whole-team
// tasks, and the due date switch.
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
      <div>
        <label htmlFor={id("assignee_id")} className="label">Assign to</label>
        <select id={id("assignee_id")} name="assignee_id" className="input" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
          <option value="">Whole team</option>
          {options.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>
      {wholeTeam && (
        <>
          <input type="hidden" name="everyone_must_complete" value={everyone ? "on" : ""} />
          <SwitchRow
            checked={everyone}
            onChange={setEveryone}
            title="Everyone has to check this off"
            description={
              everyone
                ? "Each rep ticks it off for themselves. It's done when every rep has."
                : "Off: it's done as soon as anyone ticks it."
            }
          />
        </>
      )}
      <DueDateField id={id("due_date")} initial={dueDate} />
    </>
  );
}

// The due date sits behind a switch. Off saves the task with no due date.
// The date input stays mounted (just hidden and disabled, so it isn't sent)
// so a typed date comes back if it's switched on again before saving.
export function DueDateField({ id, initial }: { id: string; initial: string }) {
  const [on, setOn] = useState(initial !== "");

  return (
    <div className="space-y-2">
      <SwitchRow
        checked={on}
        onChange={setOn}
        title="Due date"
        description={on ? "Pick when it's due." : "Off: no deadline for this task."}
      />
      <div hidden={!on}>
        <label htmlFor={id} className="label">Due</label>
        <input id={id} name="due_date" type="date" className="input" defaultValue={initial} disabled={!on} />
      </div>
    </div>
  );
}
