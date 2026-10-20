"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { useState, useTransition } from "react";
import { MAX_DIVISION_NAME } from "@/lib/projects";
import type { ProjectDivision } from "@/lib/types";
import { addDivision, moveDivision, removeDivision, renameDivision } from "./actions";

export function DivisionRow({
  division,
  projects,
  isFirst,
  isLast,
}: {
  division: ProjectDivision;
  projects: number;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [name, setName] = useState(division.name);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();
  const changed = name.trim() !== division.name;

  function run(action: () => Promise<{ error?: string }>, after?: () => void) {
    setError("");
    setSaved(false);
    startTransition(async () => {
      const res = await action();
      if (res.error) setError(res.error);
      else after?.();
    });
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!changed) return;
    run(() => renameDivision(division.id, name), () => setSaved(true));
  }

  function remove() {
    if (!confirm(`Remove "${division.name}" from the map?`)) return;
    run(() => removeDivision(division.id));
  }

  const inputId = `division-${division.id}`;
  return (
    <li className="space-y-2 py-3 first:pt-0 last:pb-0">
      <form onSubmit={save} className="flex flex-wrap items-center gap-2">
        <label htmlFor={inputId} className="sr-only">Name of {division.name}</label>
        <input
          id={inputId}
          value={name}
          maxLength={MAX_DIVISION_NAME}
          onChange={(e) => { setName(e.target.value); setSaved(false); }}
          onKeyDown={(e) => { if (e.key === "Escape") setName(division.name); }}
          className="input min-w-0 flex-1 basis-48"
        />
        {changed && (
          <button type="submit" disabled={isPending} className="btn btn-primary">Save</button>
        )}
        <span className="w-20 text-right text-xs text-muted">
          {projects} project{projects === 1 ? "" : "s"}
        </span>
        <div className="flex gap-1">
          <button
            type="button"
            className="btn btn-ghost px-2.5"
            aria-label={`Move ${division.name} up`}
            disabled={isPending || isFirst}
            onClick={() => run(() => moveDivision(division.id, "up"))}
          >
            <ArrowUp aria-hidden="true" className="size-4" />
          </button>
          <button
            type="button"
            className="btn btn-ghost px-2.5"
            aria-label={`Move ${division.name} down`}
            disabled={isPending || isLast}
            onClick={() => run(() => moveDivision(division.id, "down"))}
          >
            <ArrowDown aria-hidden="true" className="size-4" />
          </button>
          <button
            type="button"
            className="btn btn-ghost hover:text-danger"
            disabled={isPending || projects > 0}
            title={projects > 0 ? "Move its projects to another division first" : undefined}
            onClick={remove}
          >
            Remove
          </button>
        </div>
      </form>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {saved && <p role="status" className="text-xs text-success">Saved.</p>}
    </li>
  );
}

export function AddDivision() {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function add(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    startTransition(async () => {
      const res = await addDivision(name);
      if (res.error) setError(res.error);
      else setName("");
    });
  }

  return (
    <form onSubmit={add} className="space-y-2">
      <label htmlFor="new-division" className="label">Add a division</label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id="new-division"
          value={name}
          maxLength={MAX_DIVISION_NAME}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Podcasts"
          className="input"
          autoComplete="off"
        />
        <button type="submit" className="btn btn-secondary" disabled={isPending || !name.trim()}>
          {isPending ? "Adding…" : "Add"}
        </button>
      </div>
      <p className="text-xs text-muted">New divisions go at the end, just left of the top of the map.</p>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </form>
  );
}
