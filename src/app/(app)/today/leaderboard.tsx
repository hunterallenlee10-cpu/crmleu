import { ArrowDown, Users } from "lucide-react";
import Link from "next/link";
import {
  DEFAULT_PERIOD,
  METRICS,
  PERIODS,
  POINTS,
  leaderOf,
  metricValue,
  money,
  rankBy,
  type BoardRow,
  type LeadCount,
  type Metric,
  type Period,
} from "@/lib/leaderboard";

const LEAD_TILE_LABELS = ["Most leads", "2nd most leads", "3rd most leads"];

const POINT_RULES = [
  { points: String(POINTS.deal_won), label: "Closed sale" },
  { points: "1", label: `Every dollar of the sale over ${money(POINTS.bonus_over)}, rounded up` },
];

const RANK_STYLES: Record<number, string> = {
  1: "bg-accent text-on-accent",
  2: "bg-fg/[0.12] text-fg",
  3: "bg-fg/[0.12] text-fg",
};

// Opaque, so the sticky name column still covers the numbers scrolling under it.
const ME_BG = "bg-[color-mix(in_srgb,var(--color-accent)_9%,var(--color-surface))]";

const show = (metric: Metric, n: number) => (metric === "revenue" ? money(n) : n.toLocaleString("en-US"));

export function Leaderboard({
  rows,
  leadCounts,
  period,
  sort,
  meId,
}: {
  rows: BoardRow[];
  leadCounts: LeadCount[];
  period: Period;
  sort: Metric;
  meId: string;
}) {
  const ranked = rankBy(rows, sort);
  const closer = leaderOf(rows, "revenue");
  const href = (p: Period, s: Metric) => {
    const params = new URLSearchParams();
    if (p !== DEFAULT_PERIOD) params.set("board", p);
    if (s !== "points") params.set("sort", s);
    const qs = params.toString();
    return qs ? `/today?${qs}` : "/today";
  };

  return (
    <section className="space-y-4" aria-labelledby="leaderboard-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="leaderboard-title" className="section-title">Leaderboard</h2>
          <p className="mt-0.5 text-sm text-muted">Ranked by points. Click a column to rank by something else.</p>
        </div>
        <nav className="flex rounded-control border border-line bg-surface p-0.5" aria-label="Leaderboard period">
          {PERIODS.map((p) => (
            <Link
              key={p.value}
              href={href(p.value, sort)}
              scroll={false}
              aria-current={p.value === period ? "page" : undefined}
              className={`inline-flex min-h-10 items-center rounded-[4px] px-3 text-label font-medium transition-colors duration-150 sm:min-h-8 ${
                p.value === period ? "bg-accent/[0.14] text-fg" : "text-muted hover:text-fg"
              }`}
            >
              {p.label}
            </Link>
          ))}
        </nav>
      </div>

      <PointsKey />

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-4">
        <Link
          href={href(period, "revenue")}
          scroll={false}
          className={`flex flex-col gap-0.5 p-4 transition-colors duration-150 hover:bg-surface-2 focus-visible:-outline-offset-2 ${
            sort === "revenue" ? "bg-surface-2" : "bg-surface"
          }`}
        >
          <LeaderTile
            label="Top closer"
            name={closer ? (closer.user_id === meId ? "You" : closer.full_name) : null}
            value={closer ? money(closer.revenue) : null}
          />
        </Link>
        {/* Leads held right now, whatever the period above. */}
        {LEAD_TILE_LABELS.map((label, i) => {
          const holder = leadCounts[i];
          return (
            <div key={label} className="flex flex-col gap-0.5 bg-surface p-4">
              <LeaderTile
                label={label}
                name={holder ? (holder.user_id === meId ? "You" : holder.full_name) : null}
                value={holder ? `${holder.lead_count.toLocaleString("en-US")} ${holder.lead_count === 1 ? "lead" : "leads"}` : null}
              />
            </div>
          );
        })}
      </div>

      {ranked.length === 0 ? (
        <div className="empty">
          <Users aria-hidden="true" className="empty-icon" strokeWidth={1.75} />
          <p>No reps yet.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th className="sticky left-0 z-[1] text-left">Rep</th>
                {METRICS.map((m) => (
                  <th key={m.value} className="text-right">
                    <Link
                      href={href(period, m.value)}
                      scroll={false}
                      aria-sort={m.value === sort ? "descending" : undefined}
                      className={`inline-flex items-center gap-1 rounded-[4px] transition-colors duration-150 ${m.value === sort ? "text-fg" : "text-muted hover:text-fg"}`}
                    >
                      {m.short}
                      {m.value === sort && <ArrowDown aria-hidden="true" className="size-3.5" strokeWidth={2} />}
                    </Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ranked.map((r) => {
                const me = r.user_id === meId;
                const scored = metricValue(r, sort) > 0;
                return (
                  <tr key={r.user_id} className={`group ${me ? ME_BG : ""}`}>
                    <td className={`sticky left-0 text-left transition-colors duration-150 group-hover:bg-surface-2 ${me ? ME_BG : "bg-surface"}`}>
                      <span className="flex items-center gap-3">
                        <span
                          className={`inline-flex size-6 shrink-0 items-center justify-center rounded-control text-xs font-semibold ${
                            scored && RANK_STYLES[r.rank] ? RANK_STYLES[r.rank] : "border border-line text-muted"
                          }`}
                        >
                          {r.rank}
                        </span>
                        <span className="font-medium">
                          {r.full_name}
                          {me && <span className="ml-1.5 text-xs font-normal text-muted">(you)</span>}
                        </span>
                      </span>
                    </td>
                    {METRICS.map((m) => {
                      const n = m.value === "points" ? r.points : r[m.value];
                      return (
                        <td
                          key={m.value}
                          className={`text-right ${
                            n === 0 ? "text-faint" : m.value === sort ? "font-semibold text-fg" : "text-muted"
                          }`}
                        >
                          {n === 0 ? "–" : show(m.value, n)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function LeaderTile({ label, name, value }: { label: string; name: string | null; value: string | null }) {
  return (
    <>
      <span className="text-xs text-muted">{label}</span>
      <span className="truncate font-medium">{name ?? "Up for grabs"}</span>
      <span className={`mt-1 text-base font-semibold ${value ? "text-fg" : "text-faint"}`}>{value ?? "–"}</span>
    </>
  );
}

// The scoring rules, shown right on the board so reps know how to climb it.
function PointsKey() {
  return (
    <div className="rounded-card border border-line bg-surface p-4">
      <h3 className="text-sm font-semibold">How points work</h3>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2">
        {POINT_RULES.map((rule) => (
          <li key={rule.label} className="flex items-center gap-2.5">
            <span className="inline-flex h-7 min-w-10 shrink-0 items-center justify-center rounded-control bg-accent/[0.14] px-1.5 text-label font-semibold text-fg">
              +{rule.points}
            </span>
            <span className="text-label leading-snug text-muted">{rule.label}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted">
        Only closed sales score. A {money(1250)} sale is worth {POINTS.deal_won} + {1250 - POINTS.bonus_over} ={" "}
        {POINTS.deal_won + 1250 - POINTS.bonus_over} points. Outreach and bookings still have their own columns.
      </p>
    </div>
  );
}
