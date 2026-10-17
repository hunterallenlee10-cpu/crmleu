import { followUpLabel } from "@/lib/dates";
import { stageLabel, type Stage } from "@/lib/types";

// Soft tinted pills. Hues follow the pipeline from cold to closed.
const STAGE_STYLES: Record<Stage, string> = {
  new: "pill-neutral",
  contacted: "pill-accent",
  warm_up_program: "pill-info",
  call_booked: "pill-violet",
  quote_given: "pill-warning",
  won: "pill-success",
  lost: "pill-danger",
};

// The color of each stage, as a small dot (pipeline column headers).
export const STAGE_DOT: Record<Stage, string> = {
  new: "bg-faint",
  contacted: "bg-accent",
  warm_up_program: "bg-info",
  call_booked: "bg-violet",
  quote_given: "bg-warning",
  won: "bg-success",
  lost: "bg-danger",
};

export function StageBadge({ stage }: { stage: Stage }) {
  return (
    <span className={`pill ${STAGE_STYLES[stage]}`}>{stageLabel(stage)}</span>
  );
}

export function FollowUpBadge({ date, today }: { date: string | null; today: string }) {
  if (!date) return <span className="text-xs text-muted">No follow-up</span>;
  const { text, tone } = followUpLabel(date, today);
  const style =
    tone === "overdue"
      ? "pill pill-danger"
      : tone === "today"
        ? "pill pill-warning"
        : "text-xs font-medium whitespace-nowrap text-muted";
  return <span className={style}>{text}</span>;
}
