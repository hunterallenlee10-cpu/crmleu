"use client";

import { useState, useTransition } from "react";
import { logActivity } from "../actions";

const TYPES = [
  { type: "call", label: "Log call", placeholder: "How did it go? (optional)" },
  { type: "text", label: "Log text", placeholder: "What did you send? (optional)" },
  { type: "note", label: "Add note", placeholder: "Write a note" },
] as const;

type LogType = (typeof TYPES)[number]["type"];

// One tap to start logging, optional details, then save.
export function QuickLog({ leadId }: { leadId: string }) {
  const [open, setOpen] = useState<LogType | null>(null);
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [isPending, startTransition] = useTransition();

  function save() {
    if (!open) return;
    setError("");
    startTransition(async () => {
      const result = await logActivity(leadId, open, body);
      if (result.error) return setError(result.error);
      setSaved(open === "note" ? "Note added." : `${open === "call" ? "Call" : "Text"} logged.`);
      setOpen(null);
      setBody("");
    });
  }

  const current = TYPES.find((t) => t.type === open);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {TYPES.map((t) => (
          <button
            key={t.type}
            type="button"
            onClick={() => { setOpen(open === t.type ? null : t.type); setSaved(""); setError(""); }}
            aria-pressed={open === t.type}
            className={`btn px-2 text-sm ${open === t.type ? "btn-gold" : "btn-ghost"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {current && (
        <div className="space-y-3">
          <textarea
            autoFocus
            rows={3}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={current.placeholder}
            aria-label={current.label}
            className="input py-3"
          />
          <button type="button" onClick={save} disabled={isPending} className="btn btn-gold w-full">
            {isPending ? "Saving…" : "Save"}
          </button>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {saved && <p role="status" className="text-sm text-ok">{saved}</p>}
    </div>
  );
}
