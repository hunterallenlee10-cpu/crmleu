"use client";

import { useState, useTransition } from "react";
import { reassignOpenLeads } from "./actions";

// Shown for each deactivated person who still owns open leads.
export function ReassignPrompt({
  from,
  openLeads,
  assignees,
}: {
  from: { id: string; name: string };
  openLeads: number;
  assignees: { id: string; name: string }[];
}) {
  const [to, setTo] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    startTransition(async () => {
      const res = await reassignOpenLeads(from.id, to);
      if (res.error) setError(res.error);
    });
  }

  return (
    <form onSubmit={submit} role="alert" className="space-y-3 rounded-2xl border border-gold bg-gold/10 p-5">
      <p>
        <span className="font-semibold">{from.name}</span> is deactivated but still has{" "}
        <span className="font-semibold">{openLeads} open lead{openLeads === 1 ? "" : "s"}</span>. Reassign them to:
      </p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <select aria-label={`New owner for ${from.name}'s leads`} className="input sm:w-64" value={to} onChange={(e) => setTo(e.target.value)}>
          <option value="">Choose a rep…</option>
          {assignees.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <button type="submit" disabled={!to || isPending} className="btn btn-gold">
          {isPending ? "Reassigning…" : `Reassign ${openLeads} lead${openLeads === 1 ? "" : "s"}`}
        </button>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <p className="text-xs text-muted">Won and Lost leads stay with {from.name} so their commission history doesn&apos;t move.</p>
    </form>
  );
}
