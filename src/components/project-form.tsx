"use client";

import { useActionState } from "react";
import { FormMessage, type FormState } from "@/components/form-message";
import type { Project } from "@/lib/types";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;
export type AssigneeOption = { value: string; label: string };

// Create and edit form for a project (admin only). The checklist box only
// shows when creating; after that, items are managed on the project page.
export function ProjectForm({
  action,
  project,
  assignees,
  submitLabel,
}: {
  action: Action;
  project?: Project;
  assignees: AssigneeOption[];
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const isNew = !project;

  // After a submit, show what was typed; otherwise show the saved project.
  const value = (name: "name" | "description" | "assignee_id" | "due_date" | "checklist") => {
    if (state?.fields) return state.fields[name] ?? "";
    if (name === "checklist") return "";
    return project?.[name] ?? "";
  };
  // Remount inputs when the values behind them change.
  const key = JSON.stringify(state?.fields ?? project?.updated_at ?? "");

  return (
    <form action={formAction} className="space-y-5" key={key}>
      <div>
        <label htmlFor="name" className="label">Project name</label>
        <input id="name" name="name" required maxLength={200} defaultValue={value("name")} className="input" placeholder="e.g. Launch Joe's Pizza website" />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="assignee_id" className="label">Assign to</label>
          <select id="assignee_id" name="assignee_id" defaultValue={value("assignee_id")} className="input">
            <option value="">Unassigned</option>
            {assignees.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="due_date" className="label">Due date</label>
          <input id="due_date" name="due_date" type="date" defaultValue={value("due_date")} className="input" />
        </div>
      </div>
      <div>
        <label htmlFor="description" className="label">Description</label>
        <textarea id="description" name="description" rows={3} defaultValue={value("description")} className="input py-3" placeholder="What's this project about? (optional)" />
      </div>
      {isNew && (
        <div>
          <label htmlFor="checklist" className="label">Checklist</label>
          <textarea
            id="checklist"
            name="checklist"
            rows={6}
            defaultValue={value("checklist")}
            className="input py-3"
            placeholder={"One item per line, e.g.\nGet logo and photos\nWrite homepage copy\nLaunch site"}
          />
          <p className="mt-1.5 text-xs text-muted">You can add, edit or remove items later.</p>
        </div>
      )}
      <FormMessage state={state} />
      <button type="submit" disabled={pending} className="btn btn-primary w-full sm:w-auto">
        {pending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
