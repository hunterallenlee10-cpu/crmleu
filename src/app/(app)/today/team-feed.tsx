import Link from "next/link";
import { formatDateTime } from "@/lib/dates";
import {
  describeItem,
  money,
  personHighlights,
  summarizeByPerson,
  timeAgo,
  type FeedItem,
} from "@/lib/leaderboard";

const SHOWN = 30;

const TONE_STYLES = {
  win: "text-gold-light",
  lost: "text-danger",
  stage: "text-fg",
  plain: "text-muted",
} as const;

// Everything the team did in the last 24 hours: a line per person, then the
// individual entries, newest first.
export function TeamFeed({ items, meId, capped }: { items: FeedItem[]; meId: string; capped: boolean }) {
  const now = new Date();
  const people = summarizeByPerson(items);
  const totals = people.reduce(
    (t, p) => ({
      outreach: t.outreach + p.calls + p.texts + p.emails + p.meetings,
      warmUps: t.warmUps + p.warmUps,
      booked: t.booked + p.booked,
      wins: t.wins + p.wins,
      revenue: t.revenue + p.revenue,
    }),
    { outreach: 0, warmUps: 0, booked: 0, wins: 0, revenue: 0 },
  );

  return (
    <section className="space-y-4" aria-labelledby="team-feed-title">
      <div>
        <h2 id="team-feed-title" className="text-lg font-semibold tracking-tight">Last 24 hours</h2>
        <p className="mt-0.5 text-sm text-muted">What everyone on the team got done.</p>
      </div>

      <div className="grid grid-cols-4 gap-2 text-center">
        <Stat label="Outreach" value={totals.outreach.toLocaleString("en-US")} />
        <Stat label="Warm ups" value={totals.warmUps.toLocaleString("en-US")} />
        <Stat label="Booked" value={totals.booked.toLocaleString("en-US")} />
        <Stat label="Won" value={totals.wins.toLocaleString("en-US")} gold={totals.wins > 0} />
      </div>
      {totals.wins > 0 && (
        <p className="rounded-xl border border-gold/35 bg-gold/[0.08] px-4 py-2.5 text-sm text-gold-light">
          <span className="font-semibold">{money(totals.revenue)}</span> closed by the team in the last 24 hours
        </p>
      )}

      {people.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line px-5 py-6 text-center text-sm text-muted">
          Quiet so far. Log a call on one of your leads and you&apos;ll be first on the board.
        </p>
      ) : (
        <>
          <ul className="card divide-y divide-line/70 p-0">
            {people.map((p) => (
              <li key={p.user_id} className="flex items-start gap-3 px-4 py-3">
                <Avatar name={p.name} me={p.user_id === meId} />
                <div className="min-w-0">
                  <p className="font-semibold tracking-tight">
                    {p.user_id === meId ? "You" : p.name}
                    {p.wins > 0 && <span className="ml-2 text-sm font-medium text-gold-light">{money(p.revenue)} won</span>}
                  </p>
                  <p className="text-sm text-muted">{personHighlights(p).join(" · ")}</p>
                </div>
              </li>
            ))}
          </ul>

          <div className="space-y-2">
            <h3 className="eyebrow text-muted">Activity</h3>
            <ol className="space-y-1">
              {items.slice(0, SHOWN).map((item) => (
                <FeedRow key={item.id} item={item} meId={meId} now={now} />
              ))}
            </ol>
            {items.length > SHOWN && (
              <details className="group">
                <summary className="cursor-pointer list-none py-2 text-sm text-gold-light underline-offset-4 hover:underline">
                  <span className="group-open:hidden">Show {items.length - SHOWN} more</span>
                  <span className="hidden group-open:inline">Show less</span>
                </summary>
                <ol className="space-y-1">
                  {items.slice(SHOWN).map((item) => (
                    <FeedRow key={item.id} item={item} meId={meId} now={now} />
                  ))}
                </ol>
              </details>
            )}
            {capped && <p className="text-xs text-muted">Showing the latest {items.length} entries.</p>}
          </div>
        </>
      )}
    </section>
  );
}

function FeedRow({ item, meId, now }: { item: FeedItem; meId: string; now: Date }) {
  const line = describeItem(item);
  const who = item.user_id === meId ? "You" : item.actor_name;
  const body = (
    <>
      <span className="font-medium text-fg">{who}</span>{" "}
      <span className={TONE_STYLES[line.tone]}>{line.verb}</span>
      {line.lead && <> <span className="font-medium text-fg">{line.lead}</span></>}
      {line.suffix && <> <span className={TONE_STYLES[line.tone]}>{line.suffix}</span></>}
      {line.tone === "win" && item.deal_value != null && (
        <span className="ml-1.5 font-semibold text-gold-light">{money(item.deal_value)}</span>
      )}
    </>
  );
  return (
    <li>
      <div
        className={`flex items-baseline justify-between gap-3 rounded-lg px-2 py-1.5 text-sm transition-colors ${
          line.tone === "win" ? "bg-gold/[0.08] shadow-[inset_0_0_0_1px_rgb(201_162_74/0.2)]" : "hover:bg-white/[0.03]"
        }`}
      >
        <p className="min-w-0">
          {item.lead_id ? (
            <Link href={`/leads/${item.lead_id}`} className="hover:underline">{body}</Link>
          ) : (
            body
          )}
        </p>
        <time dateTime={item.created_at} title={formatDateTime(item.created_at)} className="shrink-0 text-xs text-muted">
          {timeAgo(item.created_at, now)}
        </time>
      </div>
    </li>
  );
}

function Stat({ label, value, gold }: { label: string; value: string; gold?: boolean }) {
  return (
    <div className={`card px-2 py-3 ${gold ? "card-glow" : ""}`}>
      <p className={`truncate text-lg font-semibold tracking-tight tabular-nums ${gold ? "text-gold-light" : ""}`}>{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}

function Avatar({ name, me }: { name: string; me: boolean }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return (
    <span
      aria-hidden
      className={`inline-flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
        me ? "bg-gradient-to-b from-gold-light to-gold text-ink shadow-[0_0_12px_-4px_rgb(201_162_74/0.8)]" : "border border-gold/25 bg-gradient-to-b from-[#1d1a12] to-ink text-gold"
      }`}
    >
      {initials || "?"}
    </span>
  );
}
