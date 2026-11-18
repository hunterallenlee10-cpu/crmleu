import { CircleCheck } from "lucide-react";
import { WEEKLY_TOUCH_GOAL, goalPace, type WeeklyTouches } from "@/lib/leaderboard";

// This week's outreach against the goal: the signed-in rep's own counter up
// top, then every active rep. Always this week, whatever period the
// leaderboard is showing.
export function WeeklyOutreach({ rows, meId, today }: { rows: WeeklyTouches[]; meId: string; today: string }) {
  const me = rows.find((r) => r.user_id === meId);
  const done = rows.filter((r) => r.touches >= WEEKLY_TOUCH_GOAL).length;

  return (
    <div className="rounded-card border border-line bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-sm font-semibold">Weekly outreach</h3>
        <span className="text-xs text-muted">
          {WEEKLY_TOUCH_GOAL} touches a rep · resets Monday
          {rows.length > 1 && ` · ${done} of ${rows.length} there`}
        </span>
      </div>

      {me && <MyCounter touches={me.touches} today={today} />}

      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted">No active reps yet.</p>
      ) : (
        <ul className="mt-4 space-y-2.5" aria-label="Every rep this week">
          {rows.map((r) => (
            <li key={r.user_id} className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)_4rem] items-center gap-3 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)_4rem]">
              <span className="truncate text-label font-medium">
                {r.full_name}
                {r.user_id === meId && <span className="ml-1.5 text-xs font-normal text-muted">(you)</span>}
              </span>
              <Bar touches={r.touches} label={`${r.full_name}: ${r.touches} of ${WEEKLY_TOUCH_GOAL} touches`} />
              <span className={`text-right text-label tabular-nums ${r.touches === 0 ? "text-faint" : "text-muted"}`}>
                <span className={r.touches >= WEEKLY_TOUCH_GOAL ? "font-semibold text-success" : r.touches > 0 ? "text-fg" : ""}>
                  {r.touches}
                </span>
                /{WEEKLY_TOUCH_GOAL}
              </span>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 text-xs text-muted">
        Anything you do on a lead is a touch: a call, text, email, meeting or note, a stage move, a follow-up date or an
        edit. Each lead counts once a day, so work a lead again tomorrow and it counts again.
      </p>
    </div>
  );
}

function MyCounter({ touches, today }: { touches: number; today: string }) {
  const { left, perDay } = goalPace(touches, today);
  return (
    <div className="mt-3 rounded-control border border-line bg-surface-2 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-xs text-muted">You this week</span>
        <span className={`inline-flex items-center gap-1 text-label ${left === 0 ? "font-medium text-success" : "text-muted"}`}>
          {left === 0 ? (
            <>
              <CircleCheck aria-hidden="true" className="size-4" strokeWidth={2} />
              Goal hit
            </>
          ) : (
            `${left} to go · about ${perDay} a day through Sunday`
          )}
        </span>
      </div>
      <p className="mt-1 text-2xl font-semibold tabular-nums">
        {touches}
        <span className="text-base font-medium text-muted"> / {WEEKLY_TOUCH_GOAL}</span>
      </p>
      <div className="mt-2">
        <Bar touches={touches} label={`You: ${touches} of ${WEEKLY_TOUCH_GOAL} touches this week`} big />
      </div>
    </div>
  );
}

function Bar({ touches, label, big = false }: { touches: number; label: string; big?: boolean }) {
  const pct = Math.min(touches / WEEKLY_TOUCH_GOAL, 1) * 100;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={WEEKLY_TOUCH_GOAL}
      aria-valuenow={Math.min(touches, WEEKLY_TOUCH_GOAL)}
      className={`overflow-hidden rounded-full bg-fg/[0.08] ${big ? "h-2.5" : "h-1.5"}`}
    >
      <div
        className={`h-full rounded-full transition-[width] duration-300 ${pct >= 100 ? "bg-success" : "bg-accent"}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
