import type { Metadata } from "next";
import Link from "next/link";
import { LeadRow } from "@/components/lead-row";
import { getProfile } from "@/lib/auth";
import { addDays, todayNY } from "@/lib/dates";
import { METRICS, PERIODS, toBoardRows, toFeedItems, type Metric, type Period } from "@/lib/leaderboard";
import { createClient } from "@/lib/supabase/server";
import { getEveryoneProgress } from "@/lib/tasks";
import { getTeamMembers } from "@/lib/team";
import type { Lead, Task } from "@/lib/types";
import { TaskItem } from "../tasks/task-item";
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

  // My open leads that are due (or overdue), plus fresh New leads assigned to me.
  const supabase = await createClient();
  const leadsQuery = supabase
    .from("leads")
    .select("*")
    .eq("owner_id", profile.id)
    .not("stage", "in", "(won,lost)")
    .or(`next_follow_up.lte.${today},and(stage.eq.new,assigned_at.gte.${newSince})`)
    .order("next_follow_up", { ascending: true, nullsFirst: false })
    .returns<Lead[]>();

  // My open tasks, plus ones for the whole team.
  const tasksQuery = supabase
    .from("tasks")
    .select("*")
    .is("completed_at", null)
    .or(`assignee_id.is.null,assignee_id.eq.${profile.id}`)
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at")
    .returns<Task[]>();

  const [{ data }, { data: taskData }, members, boardRes, feedRes] = await Promise.all([
    leadsQuery,
    tasksQuery,
    getTeamMembers(supabase),
    // The whole team. These only return names and counts for other people's work.
    supabase.rpc("team_leaderboard", { p_period: period }),
    supabase.rpc("team_feed", { p_limit: FEED_LIMIT }),
  ]);
  // Everyone tasks only show for reps who still have to tick them.
  const progress = await getEveryoneProgress(supabase, taskData ?? []);
  const tasks = (taskData ?? []).filter(
    (t) => !t.everyone_must_complete || progress[t.id]?.some((p) => p.user_id === profile.id && !p.checked_at),
  );
  const names = Object.fromEntries(members.map((m) => [m.id, m.full_name]));

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
        <h1 className="page-title">Today</h1>
        <p className="mt-2 text-muted">
          Hi <span className="text-fg">{firstName}</span>.{" "}
          {due === 0 ? "No follow-ups due." : `${due} follow-up${due === 1 ? "" : "s"} to do.`}
        </p>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-10">
          {tasks.length > 0 && (
            <section className="space-y-4">
              <h2 className="eyebrow flex items-center gap-3 text-fg">
                Tasks <span className="count">{tasks.length}</span>
                <span aria-hidden="true" className="h-px flex-1 bg-gradient-to-r from-line to-transparent" />
                <Link href="/tasks" className="text-xs font-medium normal-case tracking-normal text-gold-light underline-offset-4 hover:underline">
                  All tasks
                </Link>
              </h2>
              <ul className="space-y-3">
                {tasks.map((t) => (
                  <TaskItem
                    key={t.id}
                    task={t}
                    canCheck
                    progress={progress[t.id]}
                    meId={profile.id}
                    isAdmin={false}
                    assignees={[]}
                    names={names}
                    today={today}
                    showAssignee={t.assignee_id === null && !t.everyone_must_complete}
                  />
                ))}
              </ul>
            </section>
          )}

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
    <section className="space-y-4">
      <h2 className={`eyebrow flex items-center gap-3 ${tone}`}>
        {title} <span className="count">{count}</span>
        <span aria-hidden="true" className="h-px flex-1 bg-gradient-to-r from-line to-transparent" />
      </h2>
      {count === 0 ? (
        <p className="rounded-2xl border border-dashed border-line px-5 py-6 text-center text-sm text-muted">{empty}</p>
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
