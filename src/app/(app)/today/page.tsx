import type { Metadata } from "next";
import Link from "next/link";
import { LeadRow } from "@/components/lead-row";
import { ProjectRow } from "@/components/project-row";
import { getProfile } from "@/lib/auth";
import { addDays, todayNY } from "@/lib/dates";
import { progress } from "@/lib/projects";
import { createClient } from "@/lib/supabase/server";
import type { Lead, Project } from "@/lib/types";

export const metadata: Metadata = { title: "Today" };

const NEW_LEAD_WINDOW_DAYS = 7;

export default async function TodayPage() {
  const profile = await getProfile();
  const today = todayNY();
  const newSince = addDays(today, -NEW_LEAD_WINDOW_DAYS);

  // My open leads that are due (or overdue), plus fresh New leads assigned to me.
  const supabase = await createClient();
  const [{ data }, { data: projectRows }] = await Promise.all([
    supabase
      .from("leads")
      .select("*")
      .eq("owner_id", profile.id)
      .not("stage", "in", "(won,lost)")
      .or(`next_follow_up.lte.${today},and(stage.eq.new,assigned_at.gte.${newSince})`)
      .order("next_follow_up", { ascending: true, nullsFirst: false })
      .returns<Lead[]>(),
    // Projects assigned to me (admins included) that still have open items.
    supabase
      .from("projects")
      .select("id, name, due_date, project_tasks(done)")
      .eq("assignee_id", profile.id)
      .order("due_date", { ascending: true, nullsFirst: false })
      .returns<(Pick<Project, "id" | "name" | "due_date"> & { project_tasks: { done: boolean }[] })[]>(),
  ]);
  const projects = (projectRows ?? [])
    .map((p) => ({ id: p.id, name: p.name, due_date: p.due_date, ...progress(p.project_tasks) }))
    .filter((p) => !p.complete);

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

      {projects.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-fg">
            Your projects <span className="text-muted">({projects.length})</span>
          </h2>
          <div className="space-y-3">
            {projects.map((p) => (
              <ProjectRow key={p.id} project={p} today={today} />
            ))}
          </div>
        </section>
      )}
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
