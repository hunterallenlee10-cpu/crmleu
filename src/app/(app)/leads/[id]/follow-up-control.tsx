"use client";

import { useState, useTransition } from "react";
import { addDays, followUpLabel } from "@/lib/dates";
import { setFollowUp } from "../actions";

// Next follow-up date with one-tap shortcuts.
export function FollowUpControl({
  leadId,
  date,
  today,
}: {
  leadId: string;
  date: string | null;
  today: string;
}) {
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function save(next: string | null) {
    setError("");
    startTransition(async () => {
      const result = await setFollowUp(leadId, next);
      if (result.error) setError(result.error);
    });
  }

  const label = date ? followUpLabel(date, today) : null;
  const shortcuts = [
    { label: "Tomorrow", days: 1 },
    { label: "3 days", days: 3 },
    { label: "1 week", days: 7 },
    { label: "2 weeks", days: 14 },
  ];

  return (
    <div className="space-y-3">
      <p className="text-xl font-medium tracking-tight">
        {label ? (
          <span className={label.tone === "overdue" ? "text-danger" : label.tone === "today" ? "text-gold" : ""}>
            {label.text}
          </span>
        ) : (
          <span className="text-muted">Not set</span>
        )}
      </p>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        {shortcuts.map((s) => (
          <button
            key={s.days}
            type="button"
            disabled={isPending}
            onClick={() => save(addDays(today, s.days))}
            className="chip"
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="date"
          aria-label="Follow-up date"
          className="input"
          defaultValue={date ?? ""}
          key={date ?? "none"}
          disabled={isPending}
          onChange={(e) => e.target.value && save(e.target.value)}
        />
        {date && (
          <button type="button" disabled={isPending} onClick={() => save(null)} className="btn btn-ghost min-h-11 px-4 text-sm">
            Clear
          </button>
        )}
      </div>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  );
}
