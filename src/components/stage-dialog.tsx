"use client";

import { useState } from "react";
import type { Stage } from "@/lib/types";

export type StageExtras = { lostReason?: string; dealValue?: number };

// Asks for the extra info Lost and Won need. Other stages don't open it.
export function needsDetails(stage: Stage) {
  return stage === "lost" || stage === "won";
}

export function StageDialog({
  stage,
  defaultDealValue,
  pending,
  error,
  onCancel,
  onConfirm,
}: {
  stage: "lost" | "won";
  defaultDealValue?: number | null;
  pending?: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: (extras: StageExtras) => void;
}) {
  const [reason, setReason] = useState("");
  const [value, setValue] = useState(defaultDealValue ? String(defaultDealValue) : "");
  const [localError, setLocalError] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (stage === "lost") {
      if (!reason.trim()) return setLocalError("Add a reason.");
      onConfirm({ lostReason: reason.trim() });
    } else {
      const amount = Number(value.replace(/[$,\s]/g, ""));
      if (!(amount > 0)) return setLocalError("Enter the deal value.");
      onConfirm({ dealValue: amount });
    }
  }

  const shownError = localError || error;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/65 p-4 backdrop-blur-sm motion-safe:animate-fade-in sm:items-center" role="dialog" aria-modal="true">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-4 border-line-strong p-6 shadow-[0_30px_80px_-20px_rgb(0_0_0/var(--shadow-strong))] motion-safe:animate-pop-in">
        <h2 className="text-lg font-semibold tracking-tight">{stage === "lost" ? "Mark as Lost" : "Mark as Won"}</h2>
        {stage === "lost" ? (
          <div>
            <label htmlFor="lost_reason" className="label">Why was it lost?</label>
            <input
              id="lost_reason"
              autoFocus
              className="input"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Too expensive, went with someone else"
            />
          </div>
        ) : (
          <div>
            <label htmlFor="deal_value_won" className="label">Deal value ($)</label>
            <input
              id="deal_value_won"
              autoFocus
              inputMode="decimal"
              className="input"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="2500"
            />
          </div>
        )}
        {shownError && <p role="alert" className="text-sm text-danger">{shownError}</p>}
        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={onCancel} className="btn btn-ghost">Cancel</button>
          <button type="submit" disabled={pending} className="btn btn-gold">
            {pending ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}
