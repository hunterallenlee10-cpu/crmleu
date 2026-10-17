"use client";

import { useState, useTransition } from "react";
import { LeadRowBody } from "@/components/lead-row";
import type { FilterOption } from "./filters";
import type { Lead } from "@/lib/types";
import { reassignLeads } from "../admin/actions";
import Link from "next/link";

// Admin version of the lead list: tick leads, then reassign them in one go.
export function BulkLeadList({
  leads,
  today,
  ownerNames,
  assignees,
}: {
  leads: Lead[];
  today: string;
  ownerNames: Record<string, string>;
  assignees: FilterOption[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [ownerId, setOwnerId] = useState("");
  const [result, setResult] = useState<{ error?: string; message?: string }>({});
  const [isPending, startTransition] = useTransition();

  const allSelected = leads.length > 0 && leads.every((l) => selected.has(l.id));

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function reassign() {
    setResult({});
    startTransition(async () => {
      const res = await reassignLeads([...selected], ownerId);
      if (res.error) return setResult({ error: res.error });
      setResult({ message: `Reassigned ${res.count} lead${res.count === 1 ? "" : "s"}.` });
      setSelected(new Set());
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-muted">
          <input
            type="checkbox"
            className="size-5 accent-[var(--color-gold)]"
            checked={allSelected}
            onChange={() => setSelected(allSelected ? new Set() : new Set(leads.map((l) => l.id)))}
          />
          Select all on this page
        </label>
      </div>

      {selected.size > 0 && (
        <div className="sticky top-20 z-10 flex flex-wrap items-center gap-3 rounded-2xl border border-gold/50 bg-panel/90 p-4 shadow-[0_18px_50px_-18px_rgb(0_0_0/0.9),0_0_0_1px_rgb(201_162_74/0.08)] backdrop-blur-xl motion-safe:animate-pop-in">
          <span className="text-sm font-semibold text-gold-light tabular-nums">{selected.size} selected</span>
          <select aria-label="New owner" className="input flex-1 sm:w-56 sm:flex-none" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
            <option value="">Reassign to…</option>
            {assignees.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
          <button type="button" className="btn btn-gold" disabled={!ownerId || isPending} onClick={reassign}>
            {isPending ? "Reassigning…" : "Reassign"}
          </button>
        </div>
      )}
      {result.error && <p role="alert" className="text-sm text-danger">{result.error}</p>}
      {result.message && <p role="status" className="text-sm text-ok">{result.message}</p>}

      {leads.map((lead) => (
        <div key={lead.id} className="flex items-stretch gap-3">
          <label className="flex w-10 shrink-0 cursor-pointer items-center justify-center">
            <input
              type="checkbox"
              aria-label={`Select ${lead.business_name}`}
              className="size-5 accent-[var(--color-gold)]"
              checked={selected.has(lead.id)}
              onChange={() => toggle(lead.id)}
            />
          </label>
          <Link
            href={`/leads/${lead.id}`}
            className={`card card-link min-w-0 flex-1 px-5 py-4 ${selected.has(lead.id) ? "border-gold/50" : ""}`}
          >
            <LeadRowBody
              lead={lead}
              today={today}
              owner={lead.owner_id ? ownerNames[lead.owner_id] ?? "Unknown" : "Unassigned"}
            />
          </Link>
        </div>
      ))}
    </div>
  );
}
