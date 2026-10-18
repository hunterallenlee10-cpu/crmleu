import type { Metadata } from "next";
import { AlarmClock, CircleAlert, FolderKanban, Inbox, ListChecks, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { LeadRow } from "@/components/lead-row";
import { ProjectRow } from "@/components/project-row";
import { getProfile } from "@/lib/auth";
import { addDays, todayNY } from "@/lib/dates";
import { progress as checklistProgress } from "@/lib/projects";
import { METRICS, PERIODS, toBoardRows, toFeedItems, type Metric, type Period } from "@/lib/leaderboard";
import { createClient } from "@/lib/supabase/server";
import { getEveryoneProgress } from "@/lib/tasks";
import { getTeamMembers } from "@/lib/team";
import type { Lead, Project, Task } from "@/lib/types";
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

  // Projects assigned to me that still have unticked checklist items.
  const projectsQuery = supabase
    .from("projects")
    .select("id, name, due_date, project_tasks(done)")
    .eq("assignee_id", profile.id)
    .order("due_date", { ascending: true, nullsFirst: false })
    .returns<(Pick<Project, "id" | "name" | "due_date"> & { project_tasks: { done: boolean }[] })[]>();

  const [{ data }, { data: taskData }, { data: projectData }, members, boardRes, feedRes] = await Promise.all([
    leadsQuery,
    tasksQuery,
    projectsQuery,
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
  const projects = (projectData ?? [])
    .map((p) => ({ id: p.id, name: p.name, due_date: p.due_date, ...checklistProgress(p.project_tasks) }))
    .filter((p) => !p.complete);

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
        <p className="mt-1.5 text-muted">
          Hi <span className="text-fg">{firstName}</span>.{" "}
          {due === 0 ? "No follow-ups due." : `${due} follow-up${due === 1 ? "" : "s"} to do.`}
        </p>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-10">
          {tasks.length > 0 && (
            <section className="space-y-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <ListChecks aria-hidden="true" className="size-4 text-muted" strokeWidth={1.75} />
                Tasks <span className="count">{tasks.length}</span>
                <Link href="/tasks" className="ml-auto text-label font-medium text-muted underline-offset-4 hover:text-fg hover:underline">
                  All tasks
                </Link>
              </h2>
              <ul className="space-y-2">
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

          {projects.length > 0 && (
            <section className="space-y-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <FolderKanban aria-hidden="true" className="size-4 text-muted" strokeWidth={1.75} />
                Projects <span className="count">{projects.length}</span>
                <Link href="/projects" className="ml-auto text-label font-medium text-muted underline-offset-4 hover:text-fg hover:underline">
                  All projects
                </Link>
              </h2>
              <div className="grid gap-2">
                {projects.map((p) => (
                  <ProjectRow key={p.id} project={p} today={today} />
                ))}
              </div>
            </section>
          )}

          {/* Empty sections render nothing, so the board moves up when nothing is due. */}
          <Section title="Overdue" count={overdue.length} icon={CircleAlert} tone="text-danger" leads={overdue} today={today} />
          <Section title="Due today" count={dueToday.length} icon={AlarmClock} tone="text-warning" leads={dueToday} today={today} />

          {boardRes.error ? (
            <p className="text-sm text-danger">Couldn&apos;t load the leaderboard.</p>
          ) : (
            <Leaderboard rows={board} period={period} sort={sort} meId={profile.id} />
          )}

          <Section
            title="Newly assigned"
            count={fresh.length}
            icon={Inbox}
            tone="text-muted"
            leads={fresh}
            today={today}
            empty={
              <>
                No new leads in the last {NEW_LEAD_WINDOW_DAYS} days.{" "}
                <Link href="/leads/new" className="font-medium text-fg underline underline-offset-4 hover:text-accent">Add one</Link>
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
  icon: Icon,
  tone,
  leads,
  today,
  empty,
}: {
  title: string;
  count: number;
  icon: LucideIcon;
  tone: string;
  leads: Lead[];
  today: string;
  empty?: React.ReactNode;
}) {
  if (count === 0 && !empty) return null;
  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Icon aria-hidden="true" className={`size-4 ${tone}`} strokeWidth={1.75} />
        {title} <span className="count">{count}</span>
      </h2>
      {count === 0 ? (
        <div className="empty">
          <Inbox aria-hidden="true" className="empty-icon" strokeWidth={1.75} />
          <p>{empty}</p>
        </div>
      ) : (
        <div className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
          {leads.map((lead) => (
            <LeadRow key={lead.id} lead={lead} today={today} inList />
          ))}
        </div>
      )}
    </section>
  );
}
