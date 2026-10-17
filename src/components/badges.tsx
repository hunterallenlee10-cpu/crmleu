import { followUpLabel } from "@/lib/dates";
import { stageLabel, type Stage } from "@/lib/types";

const STAGE_STYLES: Record<Stage, string> = {
  new: "border-line-strong bg-white/[0.03] text-muted",
  contacted: "border-sky-400/30 bg-sky-400/[0.08] text-sky-300",
  warm_up_program: "border-violet-400/30 bg-violet-400/[0.08] text-violet-300",
  call_booked: "border-teal-400/30 bg-teal-400/[0.08] text-teal-300",
  quote_given: "border-amber-400/30 bg-amber-400/[0.08] text-amber-300",
  won: "border-gold/60 bg-gold/15 text-gold-light",
  lost: "border-danger/30 bg-danger/[0.08] text-danger",
};

// The color of each stage, as a small dot (pipeline columns, badges).
export const STAGE_DOT: Record<Stage, string> = {
  new: "bg-muted",
  contacted: "bg-sky-400",
  warm_up_program: "bg-violet-400",
  call_booked: "bg-teal-400",
  quote_given: "bg-amber-400",
  won: "bg-gold",
  lost: "bg-danger",
};

export function StageBadge({ stage }: { stage: Stage }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${STAGE_STYLES[stage]}`}
    >
      <span aria-hidden="true" className={`size-1.5 rounded-full ${STAGE_DOT[stage]}`} />
      {stageLabel(stage)}
    </span>
  );
}

export function FollowUpBadge({ date, today }: { date: string | null; today: string }) {
  if (!date) return <span className="text-xs text-muted/70">No follow-up</span>;
  const { text, tone } = followUpLabel(date, today);
  const color =
    tone === "overdue"
      ? "bg-danger/10 text-danger"
      : tone === "today"
        ? "bg-gold/[0.12] text-gold-light"
        : "text-muted";
  const pad = tone === "overdue" || tone === "today" ? "rounded-md px-1.5 py-0.5" : "";
  return <span className={`text-xs font-medium whitespace-nowrap ${pad} ${color}`}>{text}</span>;
}
