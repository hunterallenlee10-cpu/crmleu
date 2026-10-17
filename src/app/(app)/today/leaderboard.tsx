import Link from "next/link";
import {
  METRICS,
  PERIODS,
  POINTS,
  leaderOf,
  metricValue,
  money,
  rankBy,
  type BoardRow,
  type Metric,
  type Period,
} from "@/lib/leaderboard";

const LEADER_TILES: { metric: Metric; label: string }[] = [
  { metric: "outreach", label: "Most outreach" },
  { metric: "warm_ups", label: "Most warm ups" },
  { metric: "calls_booked", label: "Most calls booked" },
  { metric: "revenue", label: "Top closer" },
];

const POINT_RULES = [
  { points: POINTS.outreach, label: "Call, text, email or meeting logged" },
  { points: POINTS.warm_ups, label: "Lead moved to Warm Up Program" },
  { points: POINTS.calls_booked, label: "Lead moved to Call Booked" },
  { points: POINTS.deals_won, label: "Deal won" },
];

const RANK_STYLES: Record<number, string> = {
  1: "bg-gradient-to-b from-gilt-light to-gilt text-on-gold shadow-[0_0_14px_-4px_rgb(201_162_74/0.8)]",
  2: "bg-gradient-to-b from-zinc-200 to-zinc-400 text-on-gold",
  3: "bg-gradient-to-b from-amber-600 to-amber-800 text-fg",
};

// Opaque, so the sticky name column still covers the numbers scrolling under it.
const ME_BG = "bg-[color-mix(in_srgb,var(--color-gold)_7%,var(--color-panel))]";

const show = (metric: Metric, n: number) => (metric === "revenue" ? money(n) : n.toLocaleString("en-US"));

export function Leaderboard({
  rows,
  period,
  sort,
  meId,
}: {
  rows: BoardRow[];
  period: Period;
  sort: Metric;
  meId: string;
}) {
  const ranked = rankBy(rows, sort);
  const href = (p: Period, s: Metric) => {
    const params = new URLSearchParams();
    if (p !== "week") params.set("board", p);
    if (s !== "points") params.set("sort", s);
    const qs = params.toString();
    return qs ? `/today?${qs}` : "/today";
  };

  return (
    <section className="space-y-4" aria-labelledby="leaderboard-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="leaderboard-title" className="text-lg font-semibold tracking-tight">Leaderboard</h2>
          <p className="mt-0.5 text-sm text-muted">Ranked by points. Click a card or column to rank by something else.</p>
        </div>
        <nav className="flex rounded-full border border-line bg-panel/70 p-1 shadow-[inset_0_1px_0_rgb(255_255_255/0.04)]" aria-label="Leaderboard period">
          {PERIODS.map((p) => (
            <Link
              key={p.value}
              href={href(p.value, sort)}
              scroll={false}
              aria-current={p.value === period ? "page" : undefined}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                p.value === period ? "chip-active" : "text-muted hover:text-fg"
              }`}
            >
              {p.label}
            </Link>
          ))}
        </nav>
      </div>

      <PointsKey />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {LEADER_TILES.map(({ metric, label }) => {
          const leader = leaderOf(rows, metric);
          return (
            <Link
              key={metric}
              href={href(period, metric)}
              scroll={false}
              className="card card-link flex flex-col gap-1 p-4"
            >
              <span className="text-xs text-muted">{label}</span>
              <span className="truncate font-semibold tracking-tight">
                {leader ? (leader.user_id === meId ? "You" : leader.full_name) : "Up for grabs"}
              </span>
              <span className={`mt-1 text-xl font-semibold tracking-tight tabular-nums ${leader ? "text-gold-light" : "text-muted/60"}`}>
                {leader ? show(metric, metricValue(leader, metric)) : "–"}
              </span>
            </Link>
          );
        })}
      </div>

      {ranked.length === 0 ? (
        <p className="text-sm text-muted">No reps yet.</p>
      ) : (
        <div className="card -mx-5 overflow-x-auto rounded-none border-x-0 bg-none p-0 sm:mx-0 sm:rounded-2xl sm:border-x">
          <table className="w-full min-w-max text-sm tabular-nums [&_tbody_tr+tr]:border-t [&_tbody_tr+tr]:border-line/70">
            <thead>
              <tr>
                <th className="sticky left-0 border-b border-line bg-raised px-4 py-3 text-left text-xs font-semibold tracking-wider text-muted uppercase">Rep</th>
                {METRICS.map((m) => (
                  <th key={m.value} className="border-b border-line bg-raised px-3 py-3 text-right text-xs font-semibold tracking-wider uppercase">
                    <Link
                      href={href(period, m.value)}
                      scroll={false}
                      aria-sort={m.value === sort ? "descending" : undefined}
                      className={m.value === sort ? "text-gold-light" : "text-muted hover:text-fg"}
                    >
                      {m.short}
                      {m.value === sort && " ↓"}
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
                  <tr key={r.user_id} className={me ? ME_BG : undefined}>
                    <td className={`sticky left-0 px-4 py-3.5 text-left ${me ? ME_BG : "bg-panel"}`}>
                      <span className="flex items-center gap-3">
                        <span
                          className={`inline-flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                            scored && RANK_STYLES[r.rank] ? RANK_STYLES[r.rank] : "border border-line text-muted"
                          }`}
                        >
                          {r.rank}
                        </span>
                        <span className={me ? "font-semibold text-gold" : "font-medium"}>
                          {r.full_name}
                          {me && <span className="ml-1.5 text-xs font-normal text-gold/70">(you)</span>}
                        </span>
                      </span>
                    </td>
                    {METRICS.map((m) => {
                      const n = m.value === "points" ? r.points : r[m.value];
                      return (
                        <td
                          key={m.value}
                          className={`px-3 py-3.5 text-right ${
                            n === 0 ? "text-muted/50" : m.value === sort ? "font-semibold text-fg" : "text-muted"
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

// The scoring rules, shown right on the board so reps know how to climb it.
function PointsKey() {
  return (
    <div className="rounded-2xl border border-gold/25 bg-gold/[0.05] p-4 shadow-[inset_0_1px_0_rgb(255_255_255/0.03)]">
      <h3 className="text-sm font-semibold text-gold-light">How points work</h3>
      <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {POINT_RULES.map((rule) => (
          <li key={rule.label} className="flex items-center gap-3">
            <span className="inline-flex h-9 min-w-12 shrink-0 items-center justify-center rounded-lg bg-gradient-to-b from-gilt-light to-gilt px-2 text-sm font-bold text-on-gold tabular-nums shadow-[inset_0_1px_0_rgb(255_255_255/0.35)]">
              +{rule.points}
            </span>
            <span className="text-sm leading-snug">{rule.label}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted">
        Each lead counts once per stage. Notes and other stage changes don&apos;t score, and every win is worth the same
        no matter the deal size (see Revenue for that).
      </p>
    </div>
  );
}
