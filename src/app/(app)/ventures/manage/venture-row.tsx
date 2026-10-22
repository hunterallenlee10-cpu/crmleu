"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { useState, useTransition } from "react";
import { MAX_VENTURE_NAME } from "@/lib/ventures";
import type { Venture } from "@/lib/types";
import { addVenture, moveVenture, removeVenture, renameVenture } from "./actions";

export function VentureRow({
  venture,
  tasks,
  isFirst,
  isLast,
}: {
  venture: Pick<Venture, "id" | "name">;
  tasks: number;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [name, setName] = useState(venture.name);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();
  const changed = name.trim() !== venture.name;

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
    run(() => renameVenture(venture.id, name), () => setSaved(true));
  }

  function remove() {
    const note = tasks ? ` Its ${tasks} task${tasks === 1 ? "" : "s"} will stay on the Tasks page without a venture.` : "";
    if (!confirm(`Remove "${venture.name}" from the map?${note}`)) return;
    run(() => removeVenture(venture.id));
  }

  const inputId = `venture-${venture.id}`;
  return (
    <li className="space-y-2 py-3 first:pt-0 last:pb-0">
      <form onSubmit={save} className="flex flex-wrap items-center gap-2">
        <label htmlFor={inputId} className="sr-only">Name of {venture.name}</label>
        <input
          id={inputId}
          value={name}
          maxLength={MAX_VENTURE_NAME}
          onChange={(e) => { setName(e.target.value); setSaved(false); }}
          onKeyDown={(e) => { if (e.key === "Escape") setName(venture.name); }}
          className="input min-w-0 flex-1 basis-48"
        />
        {changed && (
          <button type="submit" disabled={isPending} className="btn btn-primary">Save</button>
        )}
        <span className="w-20 text-right text-xs text-muted">
          {tasks} task{tasks === 1 ? "" : "s"}
        </span>
        <div className="flex gap-1">
          <button
            type="button"
            className="btn btn-ghost px-2.5"
            aria-label={`Move ${venture.name} up`}
            disabled={isPending || isFirst}
            onClick={() => run(() => moveVenture(venture.id, "up"))}
          >
            <ArrowUp aria-hidden="true" className="size-4" />
          </button>
          <button
            type="button"
            className="btn btn-ghost px-2.5"
            aria-label={`Move ${venture.name} down`}
            disabled={isPending || isLast}
            onClick={() => run(() => moveVenture(venture.id, "down"))}
          >
            <ArrowDown aria-hidden="true" className="size-4" />
          </button>
          <button
            type="button"
            className="btn btn-ghost hover:text-danger"
            disabled={isPending}
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

export function AddVenture() {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function add(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    startTransition(async () => {
      const res = await addVenture(name);
      if (res.error) setError(res.error);
      else setName("");
    });
  }

  return (
    <form onSubmit={add} className="space-y-2">
      <label htmlFor="new-venture" className="label">Add a venture</label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id="new-venture"
          value={name}
          maxLength={MAX_VENTURE_NAME}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Podcasts"
          className="input"
          autoComplete="off"
        />
        <button type="submit" className="btn btn-secondary" disabled={isPending || !name.trim()}>
          {isPending ? "Adding…" : "Add"}
        </button>
      </div>
      <p className="text-xs text-muted">New ventures go at the end, just left of the top of the map.</p>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </form>
  );
}
