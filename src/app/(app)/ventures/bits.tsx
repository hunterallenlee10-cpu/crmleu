import { followUpLabel, formatDate } from "@/lib/dates";
import { STATUS_LABEL, STATUS_PILL, timelineInfo, type VentureStatus } from "@/lib/ventures";

// Small display pieces shared by the map, its panel and the list view.

export function StatusPill({ status }: { status: VentureStatus }) {
  return <span className={`pill shrink-0 ${STATUS_PILL[status]}`}>{STATUS_LABEL[status]}</span>;
}

export function DueLabel({ date, today, done }: { date: string | null; today: string; done?: boolean }) {
  if (done) return <span className="shrink-0 text-xs font-medium text-success">Done</span>;
  if (!date) return <span className="shrink-0 text-xs text-faint">No due date</span>;
  const { text, tone } = followUpLabel(date, today);
  const color = tone === "overdue" ? "text-danger" : tone === "today" ? "text-warning" : "text-muted";
  const label =
    tone === "overdue" ? text : tone === "today" ? "Due today" : text === "Tomorrow" ? "Due tomorrow" : `Due ${text}`;
  return <span className={`shrink-0 text-xs font-medium ${color}`}>{label}</span>;
}

export function ProgressBar({ done, total, label = "Tasks done" }: { done: number; total: number; label?: string }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <div
        className="h-1.5 flex-1 overflow-hidden rounded-full bg-line"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
      >
        <div
          className={`h-full rounded-full ${total > 0 && done === total ? "bg-success" : "bg-accent"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="shrink-0 text-xs tabular-nums text-muted">{total ? `${done}/${total}` : "No tasks"}</span>
    </div>
  );
}

// "Jan 1 → Dec 31 · 70 days left", with a bar showing how much time has gone.
export function Timeline({
  start,
  target,
  today,
  bar = true,
}: {
  start: string | null;
  target: string | null;
  today: string;
  bar?: boolean;
}) {
  if (!start && !target) return <p className="text-sm text-faint">No timeline yet</p>;
  const { fraction, note, late } = timelineInfo(start, target, today);
  const range = start && target
    ? `${formatDate(start, today)} → ${formatDate(target, today)}`
    : start
      ? `From ${formatDate(start, today)}`
      : `Target ${formatDate(target!, today)}`;
  return (
    <div className="space-y-1.5">
      <p className="flex flex-wrap gap-x-2 text-sm">
        <span>{range}</span>
        {note && <span className={late ? "font-medium text-danger" : "text-muted"}>· {note}</span>}
      </p>
      {bar && fraction !== null && (
        <div className="relative h-1.5 rounded-full bg-line" aria-hidden="true">
          <div
            className={`h-full rounded-full ${late ? "bg-danger/70" : "bg-fg/25"}`}
            style={{ width: `${Math.round(fraction * 100)}%` }}
          />
          <span
            className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-fg"
            style={{ left: `${Math.round(fraction * 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}
