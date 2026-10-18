import Link from "next/link";
import { followUpLabel } from "@/lib/dates";

export type ProjectSummary = {
  id: string;
  name: string;
  due_date: string | null;
  done: number;
  total: number;
  complete: boolean;
};

// One project in a list: name, who it's for, due date and checklist progress.
export function ProjectRow({
  project,
  today,
  assignee,
}: {
  project: ProjectSummary;
  today: string;
  assignee?: string;
}) {
  return (
    <Link href={`/projects/${project.id}`} className="card card-link block space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate font-medium">{project.name}</p>
          {assignee && <p className="mt-1 truncate text-xs text-muted">{assignee}</p>}
        </div>
        <DueBadge date={project.due_date} today={today} complete={project.complete} />
      </div>
      <ProgressBar done={project.done} total={project.total} />
    </Link>
  );
}

export function DueBadge({ date, today, complete }: { date: string | null; today: string; complete: boolean }) {
  if (complete) return <span className="shrink-0 text-xs font-medium text-success">Done</span>;
  if (!date) return <span className="shrink-0 text-xs text-faint">No due date</span>;
  const { text, tone } = followUpLabel(date, today);
  const color = tone === "overdue" ? "text-danger" : tone === "today" ? "text-warning" : "text-muted";
  const label =
    tone === "overdue" ? text : tone === "today" ? "Due today" : text === "Tomorrow" ? "Due tomorrow" : `Due ${text}`;
  return <span className={`shrink-0 text-xs font-medium ${color}`}>{label}</span>;
}

export function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <div
        className="h-2 flex-1 overflow-hidden rounded-full bg-line"
        role="progressbar"
        aria-label="Checklist progress"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
      >
        <div
          className={`h-full rounded-full ${total > 0 && done === total ? "bg-success" : "bg-accent"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="shrink-0 text-xs tabular-nums text-muted">
        {total ? `${done}/${total}` : "No items"}
      </span>
    </div>
  );
}
