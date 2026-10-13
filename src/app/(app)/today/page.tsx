import type { Metadata } from "next";
import Link from "next/link";
import { LeadRow } from "@/components/lead-row";
import { getProfile } from "@/lib/auth";
import { addDays, todayNY } from "@/lib/dates";
import { METRICS, PERIODS, toBoardRows, toFeedItems, type Metric, type Period } from "@/lib/leaderboard";
import { createClient } from "@/lib/supabase/server";
import type { Lead } from "@/lib/types";
import { Leaderboard } from "./leaderboard";
import { TeamFeed } from "./team-feed";

export const metadata: Metadata = { title: "Today" };

const NEW_LEAD_WINDOW_DAYS = 7;
const FEED_LIMIT = 500;

export default async function TodayPage({ searchParams }: PageProps<"/today">) {
  const profile = await getProfile();
  const today = todayNY();
  const newSince = addDays(today, -NEW_LEAD_WINDOW_DAYS);

  const sp = await searchParams;
  const period: Period = PERIODS.find((p) => p.value === sp.board)?.value ?? "week";
  const sort: Metric = METRICS.find((m) => m.value === sp.sort)?.value ?? "points";

  const supabase = await createClient();
  const [{ data }, boardRes, feedRes] = await Promise.all([
    // My open leads that are due (or overdue), plus fresh New leads assigned to me.
    supabase
      .from("leads")
      .select("*")
      .eq("owner_id", profile.id)
      .not("stage", "in", "(won,lost)")
      .or(`next_follow_up.lte.${today},and(stage.eq.new,assigned_at.gte.${newSince})`)
      .order("next_follow_up", { ascending: true, nullsFirst: false })
      .returns<Lead[]>(),
    // The whole team. These only return names and counts for other people's work.
    supabase.rpc("team_leaderboard", { p_period: period }),
    supabase.rpc("team_feed", { p_limit: FEED_LIMIT }),
  ]);

  const board = toBoardRows(boardRes.data);
  const feed = toFeedItems(feedRes.data);
  const leads = data ?? [];
  const overdue = leads.filter((l) => l.next_follow_up && l.next_follow_up < today);
  const dueToday = leads.filter((l) => l.next_follow_up === today);
  const fresh = leads
    .filter((l) => !l.next_follow_up || l.next_follow_up > today)
    .sort((a, b) => (b.assigned_at ?? "").localeCompare(a.assigned_at ?? ""));

  const firstName = profile.full_name.split(" ")[0];

  const due = overdue.length + dueToday.length;

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold">Today</h1>
        <p className="mt-1 text-muted">
          Hi {firstName}.{" "}
          {due === 0 ? "No follow-ups due." : `${due} follow-up${due === 1 ? "" : "s"} to do.`}
        </p>
      </div>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-10">
          {/* Empty sections render nothing, so the board moves up when nothing is due. */}
          <Section title="Overdue" count={overdue.length} tone="text-danger" leads={overdue} today={today} />
          <Section title="Due today" count={dueToday.length} tone="text-gold" leads={dueToday} today={today} />

          {boardRes.error ? (
            <p className="text-sm text-danger">Couldn&apos;t load the leaderboard.</p>
          ) : (
            <Leaderboard rows={board} period={period} sort={sort} meId={profile.id} />
          )}

          <Section
            title="Newly assigned"
            count={fresh.length}
            tone="text-fg"
            leads={fresh}
            today={today}
            empty={
              <>
                No new leads in the last {NEW_LEAD_WINDOW_DAYS} days.{" "}
                <Link href="/leads/new" className="text-gold underline-offset-4 hover:underline">Add one</Link>
              </>
            }
          />
        </div>

        <aside>
          {feedRes.error ? (
            <p className="text-sm text-danger">Couldn&apos;t load the team feed.</p>
          ) : (
            <TeamFeed items={feed} meId={profile.id} capped={feed.length >= FEED_LIMIT} />
          )}
        </aside>
      </div>
    </div>
  );
}

function Section({
  title,
  count,
  tone,
  leads,
  today,
  empty,
}: {
  title: string;
  count: number;
  tone: string;
  leads: Lead[];
  today: string;
  empty?: React.ReactNode;
}) {
  if (count === 0 && !empty) return null;
  return (
    <section className="space-y-3">
      <h2 className={`text-sm font-semibold uppercase tracking-wider ${tone}`}>
        {title} <span className="text-muted">({count})</span>
      </h2>
      {count === 0 ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : (
        <div className="space-y-3">
          {leads.map((lead) => (
            <LeadRow key={lead.id} lead={lead} today={today} />
          ))}
        </div>
      )}
    </section>
  );
}
