"use client";

import { useActionState, useEffect, useState } from "react";
import { FormMessage } from "@/components/form-message";
import { SwitchRow } from "@/components/switch-row";
import { MAX_VENTURE_DESCRIPTION, MAX_VENTURE_NAME, STATUS_LABEL, VENTURE_STATUSES, type VentureStatus } from "@/lib/ventures";
import { createTask } from "../tasks/actions";
import { DueDateField } from "../tasks/task-form";
import { updateVenture } from "./actions";

export type Person = { id: string; name: string };
export type VentureDetails = {
  id: string;
  name: string;
  description: string | null;
  status: VentureStatus;
  leadId: string | null;
  lead: string | null;
  startDate: string | null;
  targetDate: string | null;
};

// Admin only: what the venture is, who runs it, its status and timeline.
export function VentureForm({
  venture,
  people,
  onDone,
  autoFocus = false,
}: {
  venture: VentureDetails;
  people: Person[];
  onDone?: () => void;
  autoFocus?: boolean;
}) {
  const [state, action, pending] = useActionState(updateVenture.bind(null, venture.id), undefined);

  useEffect(() => {
    if (state?.message) onDone?.();
  }, [state, onDone]);

  const saved: Record<string, string> = {
    name: venture.name,
    description: venture.description ?? "",
    lead_id: venture.leadId ?? "",
    status: venture.status,
    start_date: venture.startDate ?? "",
    target_date: venture.targetDate ?? "",
  };
  // After an error, show what was typed; otherwise the saved values.
  const value = (name: string) => (state?.error ? (state.fields?.[name] ?? "") : saved[name]);
  const id = (name: string) => `${name}-${venture.id}`;
  const key = state?.error ? JSON.stringify(state.fields) : JSON.stringify(saved);

  // Keep a deactivated lead selectable so saving doesn't quietly drop them.
  const options =
    venture.leadId && !people.some((p) => p.id === venture.leadId)
      ? [...people, { id: venture.leadId, name: `${venture.lead ?? "Former member"} (inactive)` }]
      : people;

  return (
    <form action={action} className="space-y-4" key={key}>
      <div>
        <label htmlFor={id("description")} className="label">What is this venture?</label>
        <textarea
          id={id("description")}
          name="description"
          rows={4}
          maxLength={MAX_VENTURE_DESCRIPTION}
          className="input resize-y py-3 leading-relaxed"
          defaultValue={value("description")}
          placeholder="What it sells or builds, who it's for, and what winning looks like."
          autoFocus={autoFocus}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={id("lead_id")} className="label">Who&apos;s running it</label>
          <select id={id("lead_id")} name="lead_id" className="input" defaultValue={value("lead_id")}>
            <option value="">No one yet</option>
            {options.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor={id("status")} className="label">Status</label>
          <select id={id("status")} name="status" className="input" defaultValue={value("status")}>
            {VENTURE_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </div>
      </div>
      <TimelineFields id={id} start={value("start_date")} target={value("target_date")} />
      <div>
        <label htmlFor={id("name")} className="label">Name</label>
        <input
          id={id("name")}
          name="name"
          required
          maxLength={MAX_VENTURE_NAME}
          className="input"
          defaultValue={value("name")}
        />
      </div>
      <FormMessage state={state?.error ? state : undefined} />
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? "Saving…" : "Save venture"}
        </button>
        {onDone && (
          <button type="button" onClick={onDone} className="btn btn-secondary">Cancel</button>
        )}
      </div>
    </form>
  );
}

// The venture's start and target dates sit behind a switch. Off clears both
// when saved; the inputs stay mounted (hidden and disabled, so they aren't
// sent) so typed dates come back if it's switched on again before saving.
function TimelineFields({ id, start, target }: { id: (name: string) => string; start: string; target: string }) {
  const [on, setOn] = useState(start !== "" || target !== "");

  return (
    <div className="space-y-2">
      <SwitchRow
        checked={on}
        onChange={setOn}
        title="Timeline"
        description={on ? "When it started and when it should get there." : "Off: no start or target date."}
      />
      <div hidden={!on} className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={id("start_date")} className="label">Started</label>
          <input id={id("start_date")} name="start_date" type="date" className="input" defaultValue={start} disabled={!on} />
        </div>
        <div>
          <label htmlFor={id("target_date")} className="label">Target date</label>
          <input id={id("target_date")} name="target_date" type="date" className="input" defaultValue={target} disabled={!on} />
        </div>
      </div>
    </div>
  );
}

// Admin only: add a task straight onto a venture.
export function QuickAddTask({ ventureId, people }: { ventureId: string; people: Person[] }) {
  const [state, action, pending] = useActionState(createTask, undefined);
  const id = (name: string) => `quick-${name}-${ventureId}`;
  const value = (name: string) => (state?.error ? (state.fields?.[name] ?? "") : "");

  // React empties the form after each task is added; after an error it's
  // re-filled with what was typed.
  return (
    <form action={action} className="space-y-3" key={state?.error ? JSON.stringify(state.fields) : "fresh"}>
      <input type="hidden" name="venture_id" value={ventureId} />
      <input type="hidden" name="details" value="" />
      <div>
        <label htmlFor={id("title")} className="sr-only">New task</label>
        <input
          id={id("title")}
          name="title"
          required
          maxLength={200}
          className="input"
          placeholder="What needs doing?"
          defaultValue={value("title")}
          autoComplete="off"
        />
      </div>
      <div>
        <label htmlFor={id("assignee_id")} className="label">Assign to</label>
        <select id={id("assignee_id")} name="assignee_id" className="input" defaultValue={value("assignee_id")}>
          <option value="">Whole team</option>
          {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <DueDateField id={id("due_date")} initial={value("due_date")} />
      <FormMessage state={state?.error ? state : undefined} />
      {state?.message && <p role="status" className="text-xs text-success">Task added.</p>}
      <button type="submit" disabled={pending} className="btn btn-secondary w-full">
        {pending ? "Adding…" : "+ Add task"}
      </button>
    </form>
  );
}
