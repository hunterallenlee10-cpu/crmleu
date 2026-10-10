"use client";

import { useState, useTransition } from "react";
import { needsDetails, StageDialog, type StageExtras } from "@/components/stage-dialog";
import { STAGES, type Stage } from "@/lib/types";
import { changeStage } from "../actions";

// Stage picker as a row of chips. Lost and Won ask for details first.
export function StageControl({
  leadId,
  stage,
  dealValue,
}: {
  leadId: string;
  stage: Stage;
  dealValue: number | null;
}) {
  const [pendingStage, setPendingStage] = useState<"lost" | "won" | null>(null);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function save(next: Stage, extras: StageExtras = {}) {
    setError("");
    startTransition(async () => {
      const result = await changeStage(leadId, { stage: next, ...extras });
      if (result.error) setError(result.error);
      else setPendingStage(null);
    });
  }

  function pick(next: Stage) {
    if (next === stage || isPending) return;
    if (needsDetails(next)) setPendingStage(next as "lost" | "won");
    else save(next);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {STAGES.map((s) => (
          <button
            key={s.value}
            type="button"
            onClick={() => pick(s.value)}
            aria-pressed={s.value === stage}
            disabled={isPending}
            className={`min-h-11 rounded-full border px-4 text-sm font-medium transition-colors ${
              s.value === stage
                ? "border-gold bg-gold text-black"
                : "border-line text-muted hover:border-gold hover:text-gold"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
      {error && !pendingStage && <p role="alert" className="text-sm text-danger">{error}</p>}
      {pendingStage && (
        <StageDialog
          stage={pendingStage}
          defaultDealValue={dealValue}
          pending={isPending}
          error={error}
          onCancel={() => { setPendingStage(null); setError(""); }}
          onConfirm={(extras) => save(pendingStage, extras)}
        />
      )}
    </div>
  );
}
