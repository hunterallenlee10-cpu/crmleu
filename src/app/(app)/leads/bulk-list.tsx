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
        <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-control pr-2 pl-3 text-label text-muted transition-colors duration-150 hover:text-fg sm:pl-4">
          <input
            type="checkbox"
            className="size-4"
            checked={allSelected}
            onChange={() => setSelected(allSelected ? new Set() : new Set(leads.map((l) => l.id)))}
          />
          Select all on this page
        </label>
      </div>

      {selected.size > 0 && (
        <div className="sticky top-16 z-10 flex flex-wrap items-center gap-3 rounded-card border border-line-strong bg-surface p-3 shadow-float motion-safe:animate-pop-in">
          <span className="px-1 text-sm font-medium">{selected.size} selected</span>
          <select aria-label="New owner" className="input flex-1 sm:w-56 sm:flex-none" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
            <option value="">Reassign to…</option>
            {assignees.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
          <button type="button" className="btn btn-primary" disabled={!ownerId || isPending} onClick={reassign}>
            {isPending ? "Reassigning…" : "Reassign"}
          </button>
        </div>
      )}
      {result.error && <p role="alert" className="text-sm text-danger">{result.error}</p>}
      {result.message && <p role="status" className="text-sm text-success">{result.message}</p>}

      <div className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface empty:hidden">
      {leads.map((lead) => (
        <div key={lead.id} className={`flex items-stretch transition-colors duration-150 ${selected.has(lead.id) ? "bg-accent/[0.07]" : ""}`}>
          <label className="flex w-11 shrink-0 cursor-pointer items-center justify-center pl-1 sm:w-12">
            <input
              type="checkbox"
              aria-label={`Select ${lead.business_name}`}
              className="size-4"
              checked={selected.has(lead.id)}
              onChange={() => toggle(lead.id)}
            />
          </label>
          <Link
            href={`/leads/${lead.id}`}
            className="min-w-0 flex-1 py-3.5 pr-4 pl-1 transition-colors duration-150 hover:bg-surface-2 focus-visible:-outline-offset-2 sm:pr-5"
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
    </div>
  );
}
