"use client";

import { useState, useTransition } from "react";
import type { FilterOption } from "../filters";
import { deleteActivity, deleteLead, reassignLeads } from "../../admin/actions";

// Admin only: change the owner or delete the lead.
export function AdminLeadControls({
  leadId,
  ownerId,
  assignees,
}: {
  leadId: string;
  ownerId: string | null;
  assignees: FilterOption[];
}) {
  const [owner, setOwner] = useState(ownerId ?? "");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function reassign() {
    setError("");
    setMessage("");
    startTransition(async () => {
      const res = await reassignLeads([leadId], owner);
      if (res.error) setError(res.error);
      else setMessage("Owner updated.");
    });
  }

  function remove() {
    if (!confirm("Delete this lead and its whole history? This can't be undone.")) return;
    startTransition(async () => {
      const res = await deleteLead(leadId);
      if (res?.error) setError(res.error);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <select aria-label="Owner" className="input sm:w-64" value={owner} onChange={(e) => setOwner(e.target.value)}>
          {!ownerId && <option value="">Unassigned</option>}
          {assignees.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
        </select>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={isPending || !owner || owner === (ownerId ?? "")}
          onClick={reassign}
        >
          Reassign
        </button>
      </div>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {message && <p role="status" className="text-sm text-success">{message}</p>}
      <div className="border-t border-line" />
      <button type="button" className="btn btn-danger" disabled={isPending} onClick={remove}>
        Delete lead
      </button>
    </div>
  );
}

export function DeleteActivityButton({ activityId }: { activityId: number }) {
  const [isPending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        if (confirm("Delete this history entry?")) startTransition(async () => { await deleteActivity(activityId); });
      }}
      className="ml-2 rounded-[4px] text-xs text-muted underline-offset-2 transition-colors duration-150 hover:text-danger hover:underline"
    >
      Delete
    </button>
  );
}
