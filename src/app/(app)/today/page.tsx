import type { Metadata } from "next";
import Link from "next/link";
import { LeadRow } from "@/components/lead-row";
import { getProfile } from "@/lib/auth";
import { addDays, todayNY } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { getEveryoneProgress } from "@/lib/tasks";
import { getTeamMembers } from "@/lib/team";
import type { Lead, Task } from "@/lib/types";
import { TaskItem } from "../tasks/task-item";

export const metadata: Metadata = { title: "Today" };

const NEW_LEAD_WINDOW_DAYS = 7;

export default async function TodayPage() {
  const profile = await getProfile();
  const today = todayNY();
  const newSince = addDays(today, -NEW_LEAD_WINDOW_DAYS);

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

  const [{ data }, { data: taskData }, members] = await Promise.all([
    leadsQuery,
    tasksQuery,
    getTeamMembers(supabase),
  ]);
  // Everyone tasks only show for reps who still have to tick them.
  const progress = await getEveryoneProgress(supabase, taskData ?? []);
  const tasks = (taskData ?? []).filter(
    (t) => !t.everyone_must_complete || progress[t.id]?.some((p) => p.user_id === profile.id && !p.checked_at),
  );
  const names = Object.fromEntries(members.map((m) => [m.id, m.full_name]));

  const leads = data ?? [];
  const overdue = leads.filter((l) => l.next_follow_up && l.next_follow_up < today);
  const dueToday = leads.filter((l) => l.next_follow_up === today);
  const fresh = leads
    .filter((l) => !l.next_follow_up || l.next_follow_up > today)
    .sort((a, b) => (b.assigned_at ?? "").localeCompare(a.assigned_at ?? ""));

  const firstName = profile.full_name.split(" ")[0];

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold">Today</h1>
        <p className="mt-1 text-muted">
          Hi {firstName}.{" "}
          {overdue.length + dueToday.length === 0
            ? "No follow-ups due."
            : `${overdue.length + dueToday.length} follow-up${overdue.length + dueToday.length === 1 ? "" : "s"} to do.`}
        </p>
      </div>

      {tasks.length > 0 && (
        <section className="space-y-3">
          <h2 className="flex items-baseline justify-between gap-3 text-sm font-semibold uppercase tracking-wider text-fg">
            <span>Tasks <span className="text-muted">({tasks.length})</span></span>
            <Link href="/tasks" className="text-xs font-medium normal-case tracking-normal text-gold underline-offset-4 hover:underline">
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

      <Section title="Overdue" count={overdue.length} tone="text-danger" leads={overdue} today={today} />
      <Section title="Due today" count={dueToday.length} tone="text-gold" leads={dueToday} today={today} />
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
