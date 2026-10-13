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
  { metric: "specs_sent", label: "Most specs sent" },
  { metric: "calls_booked", label: "Most calls booked" },
  { metric: "revenue", label: "Top closer" },
];

const RANK_STYLES: Record<number, string> = {
  1: "bg-gold text-black",
  2: "bg-zinc-300 text-black",
  3: "bg-amber-700 text-fg",
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
          <h2 id="leaderboard-title" className="text-lg font-semibold">Leaderboard</h2>
          <p className="text-sm text-muted">
            {POINTS.outreach} pt per call, text, email or meeting · {POINTS.specs_sent} per spec sent ·{" "}
            {POINTS.calls_booked} per call booked · {POINTS.deals_won} per deal won
          </p>
        </div>
        <nav className="flex rounded-xl border border-line p-1" aria-label="Leaderboard period">
          {PERIODS.map((p) => (
            <Link
              key={p.value}
              href={href(p.value, sort)}
              scroll={false}
              aria-current={p.value === period ? "page" : undefined}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                p.value === period ? "bg-gold text-black" : "text-muted hover:text-fg"
              }`}
            >
              {p.label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {LEADER_TILES.map(({ metric, label }) => {
          const leader = leaderOf(rows, metric);
          return (
            <Link
              key={metric}
              href={href(period, metric)}
              scroll={false}
              className="card flex flex-col gap-1 p-4 transition-colors hover:border-gold/60"
            >
              <span className="text-xs text-muted">{label}</span>
              <span className="truncate font-medium">
                {leader ? (leader.user_id === meId ? "You" : leader.full_name) : "Up for grabs"}
              </span>
              <span className={`text-xl font-semibold tabular-nums ${leader ? "text-gold" : "text-muted/60"}`}>
                {leader ? show(metric, metricValue(leader, metric)) : "–"}
              </span>
            </Link>
          );
        })}
      </div>

      {ranked.length === 0 ? (
        <p className="text-sm text-muted">No reps yet.</p>
      ) : (
        <div className="card -mx-5 overflow-x-auto rounded-none border-x-0 p-0 sm:mx-0 sm:rounded-2xl sm:border-x">
          <table className="w-full min-w-max text-sm tabular-nums">
            <thead>
              <tr>
                <th className="sticky left-0 border-b border-line bg-panel px-4 py-3 text-left font-medium text-muted">Rep</th>
                {METRICS.map((m) => (
                  <th key={m.value} className="border-b border-line px-3 py-3 text-right font-medium">
                    <Link
                      href={href(period, m.value)}
                      scroll={false}
                      aria-sort={m.value === sort ? "descending" : undefined}
                      className={m.value === sort ? "text-gold" : "text-muted hover:text-fg"}
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
                    <td className={`sticky left-0 px-4 py-3 text-left ${me ? ME_BG : "bg-panel"}`}>
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
                          className={`px-3 py-3 text-right ${
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
