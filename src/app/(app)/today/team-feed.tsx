import { Activity } from "lucide-react";
import Link from "next/link";
import { formatDateTime } from "@/lib/dates";
import { describeItem, money, timeAgo, type FeedItem } from "@/lib/leaderboard";

const SHOWN = 30;

const TONE_STYLES = {
  win: "text-success",
  lost: "text-danger",
  stage: "text-fg",
  plain: "text-muted",
} as const;

// The team's latest actions, newest first. Not cut off by time, so there's
// always something here even on a slow day.
export function TeamFeed({ items, meId, capped }: { items: FeedItem[]; meId: string; capped: boolean }) {
  const now = new Date();

  if (items.length === 0) {
    return (
      <div className="empty">
        <Activity aria-hidden="true" className="empty-icon" strokeWidth={1.75} />
        <p>Nothing yet. Log a call on one of your leads and you&apos;ll be first on the board.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
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
      {capped && <p className="px-2 text-xs text-muted">Showing the latest {items.length} entries.</p>}
    </div>
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
