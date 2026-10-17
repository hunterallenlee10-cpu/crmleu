import { Activity } from "lucide-react";
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
  win: "text-success",
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
        <h2 id="team-feed-title" className="section-title">Last 24 hours</h2>
        <p className="mt-0.5 text-sm text-muted">What everyone on the team got done.</p>
      </div>

      <div className="grid grid-cols-4 gap-px overflow-hidden rounded-card border border-line bg-line text-center">
        <Stat label="Outreach" value={totals.outreach.toLocaleString("en-US")} />
        <Stat label="Warm ups" value={totals.warmUps.toLocaleString("en-US")} />
        <Stat label="Booked" value={totals.booked.toLocaleString("en-US")} />
        <Stat label="Won" value={totals.wins.toLocaleString("en-US")} gold={totals.wins > 0} />
      </div>
      {totals.wins > 0 && (
        <p className="rounded-control bg-success/[0.12] px-3 py-2.5 text-sm text-success">
          <span className="font-semibold">{money(totals.revenue)}</span> closed by the team in the last 24 hours
        </p>
      )}

      {people.length === 0 ? (
        <div className="empty">
          <Activity aria-hidden="true" className="empty-icon" strokeWidth={1.75} />
          <p>Quiet so far. Log a call on one of your leads and you&apos;ll be first on the board.</p>
        </div>
      ) : (
        <>
          <ul className="divide-y divide-line rounded-card border border-line bg-surface">
            {people.map((p) => (
              <li key={p.user_id} className="flex items-start gap-3 px-4 py-3">
                <Avatar name={p.name} me={p.user_id === meId} />
                <div className="min-w-0">
                  <p className="font-medium">
                    {p.user_id === meId ? "You" : p.name}
                    {p.wins > 0 && <span className="ml-2 text-label font-medium text-success">{money(p.revenue)} won</span>}
                  </p>
                  <p className="text-label text-muted">{personHighlights(p).join(" · ")}</p>
                </div>
              </li>
            ))}
          </ul>

          <div className="space-y-2">
            <h3 className="group-title pt-2 text-muted">Activity</h3>
            <ol className="space-y-1">
              {items.slice(0, SHOWN).map((item) => (
                <FeedRow key={item.id} item={item} meId={meId} now={now} />
              ))}
            </ol>
            {items.length > SHOWN && (
              <details className="group">
                <summary className="cursor-pointer list-none rounded-control px-2 py-2 text-label font-medium text-muted underline-offset-4 hover:text-fg hover:underline">
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
        <span className="ml-1.5 font-semibold text-success">{money(item.deal_value)}</span>
      )}
    </>
  );
  return (
    <li>
      <div
        className={`flex items-baseline justify-between gap-3 rounded-control px-2 py-1.5 text-sm transition-colors duration-150 ${
          line.tone === "win" ? "bg-success/[0.1]" : "hover:bg-fg/[0.04]"
        }`}
      >
        <p className="min-w-0">
          {item.lead_id ? (
            <Link href={`/leads/${item.lead_id}`} className="rounded-[4px] hover:underline">{body}</Link>
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
    <div className="bg-surface px-2 py-3">
      <p className={`truncate text-base font-semibold ${gold ? "text-success" : ""}`}>{value}</p>
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
      className={`inline-flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
        me ? "bg-accent text-on-accent" : "border border-line bg-surface-2 text-muted"
      }`}
    >
      {initials || "?"}
    </span>
  );
}
