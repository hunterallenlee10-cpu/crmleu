import { followUpLabel } from "@/lib/dates";
import { stageLabel, type Stage } from "@/lib/types";

const STAGE_STYLES: Record<Stage, string> = {
  new: "border-line text-muted",
  contacted: "border-sky-400/40 text-sky-300",
  spec_sent: "border-violet-400/40 text-violet-300",
  call_booked: "border-teal-400/40 text-teal-300",
  proposal_sent: "border-amber-400/40 text-amber-300",
  won: "border-gold bg-gold/15 text-gold",
  lost: "border-danger/40 text-danger",
};

export function StageBadge({ stage }: { stage: Stage }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${STAGE_STYLES[stage]}`}>
      {stageLabel(stage)}
    </span>
  );
}

export function FollowUpBadge({ date, today }: { date: string | null; today: string }) {
  if (!date) return <span className="text-xs text-muted/70">No follow-up</span>;
  const { text, tone } = followUpLabel(date, today);
  const color = tone === "overdue" ? "text-danger" : tone === "today" ? "text-gold" : "text-muted";
  return <span className={`text-xs font-medium ${color}`}>{text}</span>;
}
