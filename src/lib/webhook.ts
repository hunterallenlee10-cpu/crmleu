import "server-only";
import { after } from "next/server";
import type { Lead, Stage } from "@/lib/types";

export type StageChangedPayload = {
  event: "stage_changed";
  from_stage: Stage;
  to_stage: Stage;
  changed_at: string;
  lead: Lead;
  owner: { id: string; name: string; email: string } | null;
};

// If WEBHOOK_URL is set, POST the stage change there (e.g. an n8n webhook that
// kicks off onboarding on Won). Runs after the response is sent, so the rep
// never waits on it, and any failure is logged and otherwise ignored.
export function sendStageChangedWebhook(payload: StageChangedPayload) {
  const url = process.env.WEBHOOK_URL;
  if (!url) return;

  after(async () => {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) console.warn(`Stage webhook returned ${res.status} (ignored)`);
    } catch (err) {
      console.warn("Stage webhook failed (ignored):", err instanceof Error ? err.message : err);
    }
  });
}
