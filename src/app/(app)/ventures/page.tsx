import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { getProfile } from "@/lib/auth";
import { todayNY } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { getEveryoneProgress } from "@/lib/tasks";
import { getTeamMembers } from "@/lib/team";
import type { EveryoneProgress, Task, TeamMember, Venture } from "@/lib/types";
import { DEFAULT_TITLES, type TitlePromotion } from "@/lib/promotions";
import { personColor } from "@/lib/venture-map";
import { TaskItem } from "../tasks/task-item";
import { ProgressBar, StatusPill, Timeline, hasTimeline } from "./bits";
import { TeamChart, type ChartPerson, type ChartVenture } from "./team-chart";
import { PersonChips, ViewSwitch, type PersonChip, type VenturesView } from "./toolbar";
import { QuickAddTask, VentureForm, type Person } from "./venture-forms";
import { VentureMap, type MapTask, type MapVenture } from "./venture-map";

export const metadata: Metadata = { title: "Ventures" };

export default async function VenturesPage({ searchParams }: PageProps<"/ventures">) {
  const profile = await getProfile();
  const isAdmin = profile.role === "admin";
  const { person, view: viewParam } = await searchParams;
  const personFilter =
    typeof person === "string" && (person === "team" || z.guid().safeParse(person).success) ? person : "";
  const view: VenturesView = viewParam === "list" || viewParam === "team" ? viewParam : "map";
  const today = todayNY();
  const supabase = await createClient();

  // Every active team member can see every venture and every task.
  const [{ data: ventureRows }, { data: taskRows }, { data: coLeadRows }, members] = await Promise.all([
    supabase.from("ventures").select("*").order("position").order("created_at").returns<Venture[]>(),
    supabase
      .from("tasks")
      .select("*")
      .not("venture_id", "is", null)
      .order("completed_at", { ascending: true, nullsFirst: true })
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at")
      .returns<Task[]>(),
    // Missing until the venture_co_leads migration has run; then nobody co-leads.
    supabase
      .from("venture_co_leads")
      .select("venture_id, user_id")
      .order("created_at")
      .returns<{ venture_id: string; user_id: string }[]>(),
    getTeamMembers(supabase),
  ]);

  const names = new Map(members.map((m) => [m.id, m.full_name]));
  const colorIndex = new Map(members.map((m, i) => [m.id, i]));
  const colorOf = (id: string | null) => personColor(id ? (colorIndex.get(id) ?? -1) : -1);
  const people: Person[] = members.filter((m) => m.active).map((m) => ({ id: m.id, name: m.full_name }));
  const rows = taskRows ?? [];

  const ventures: MapVenture[] = (ventureRows ?? []).map((v) => ({
    id: v.id,
    name: v.name,
    description: v.description,
    status: v.status,
    leadId: v.lead_id,
    lead: v.lead_id ? (names.get(v.lead_id) ?? "Former member") : null,
    leadColor: colorOf(v.lead_id),
    coLeads: (coLeadRows ?? [])
      .filter((c) => c.venture_id === v.id && c.user_id !== v.lead_id)
      .map((c) => ({ id: c.user_id, name: names.get(c.user_id) ?? "Former member", color: colorOf(c.user_id) })),
    startDate: v.start_date,
    targetDate: v.target_date,
  }));

  const tasks: MapTask[] = rows.map((t) => ({
    id: t.id,
    title: t.title,
    details: t.details,
    ventureId: t.venture_id!,
    assigneeId: t.assignee_id,
    assignee: !t.assignee_id ? "Whole team" : t.assignee_id === profile.id ? "You" : (names.get(t.assignee_id) ?? "Former member"),
    color: colorOf(t.assignee_id),
    dueDate: t.due_date,
    done: t.completed_at !== null,
    everyone: t.everyone_must_complete,
    canCheck: !t.everyone_must_complete && (isAdmin || !t.assignee_id || t.assignee_id === profile.id),
  }));

  // Filter by anyone who has a task on a venture.
  const isOpen = (t: MapTask) => !t.done;
  const chips: PersonChip[] = [];
  for (const m of members) {
    const theirs = tasks.filter((t) => t.assigneeId === m.id);
    if (theirs.length) {
      chips.push({
        value: m.id,
        label: `${m.id === profile.id ? "You" : m.full_name}${m.active ? "" : " (inactive)"}`,
        color: colorOf(m.id),
        count: theirs.filter(isOpen).length,
      });
    }
  }
  const team = tasks.filter((t) => !t.assigneeId);
  if (team.length) chips.push({ value: "team", label: "Whole team", color: colorOf(null), count: team.filter(isOpen).length });

  const listProps = { ventures, rows, people, person: personFilter, isAdmin, meId: profile.id, today, names };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="page-title">Ventures</h1>
          <p className="mt-1.5 text-muted">
            The big branches of LEU and the tasks moving each one forward.
          </p>
        </div>
        {isAdmin && (
          <div className="flex flex-wrap gap-2">
            <Link href="/ventures/manage" className="btn btn-secondary">Edit ventures</Link>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        {view === "team" ? (
          <h2 className="section-title">Team</h2>
        ) : (
          <PersonChips value={personFilter} people={chips} total={tasks.filter(isOpen).length} />
        )}
        <ViewSwitch value={view} />
      </div>

      {view === "team" ? (
        <TeamView members={members} ventures={ventures} meId={profile.id} isAdmin={isAdmin} colorOf={colorOf} />
      ) : view === "list" ? (
        <VentureList {...listProps} />
      ) : (
        <VentureMap
          ventures={ventures}
          tasks={tasks}
          people={people}
          person={personFilter}
          isAdmin={isAdmin}
          today={today}
        />
      )}
    </div>
  );
}

// The org chart, with the promotions up for grabs. Counts every open task
// assigned to each person, not just ones on a venture. Co-leads aren't on the
// chart; they're picked in each venture's own form.
async function TeamView({
  members,
  ventures,
  meId,
  isAdmin,
  colorOf,
}: {
  members: TeamMember[];
  ventures: MapVenture[];
  meId: string;
  isAdmin: boolean;
  colorOf: (id: string | null) => string;
}) {
  const supabase = await createClient();
  const [{ data: open }, { data: promotionRows, error: promotionError }] = await Promise.all([
    supabase
      .from("tasks")
      .select("assignee_id")
      .is("completed_at", null)
      .not("assignee_id", "is", null)
      .returns<{ assignee_id: string }[]>(),
    supabase.from("promotions").select("id, title").order("seq").returns<{ id: string; title: string }[]>(),
  ]);
  const openCount = new Map<string, number>();
  for (const t of open ?? []) openCount.set(t.assignee_id, (openCount.get(t.assignee_id) ?? 0) + 1);

  const people: ChartPerson[] = members
    .filter((m) => m.active)
    .map((m) => ({
      id: m.id,
      name: m.full_name,
      role: m.role,
      title: m.title ?? null,
      reportsTo: m.reports_to ?? null,
      color: colorOf(m.id),
      isMe: m.id === meId,
      openTasks: openCount.get(m.id) ?? 0,
    }));
  const seats: ChartVenture[] = ventures.map((v) => ({ id: v.id, name: v.name, status: v.status, leadId: v.leadId }));
  // Before the promotions migration has run, fall back to the original three.
  const titles: TitlePromotion[] = promotionError
    ? DEFAULT_TITLES.map((title) => ({ id: null, title }))
    : (promotionRows ?? []).map((p) => ({ id: p.id, title: p.title }));
  return <TeamChart people={people} ventures={seats} titles={titles} isAdmin={isAdmin} />;
}

// The same ventures and tasks as a list.
async function VentureList({
  ventures,
  rows,
  people,
  person,
  isAdmin,
  meId,
  today,
  names,
}: {
  ventures: MapVenture[];
  rows: Task[];
  people: Person[];
  person: string;
  isAdmin: boolean;
  meId: string;
  today: string;
  names: Map<string, string>;
}) {
  const shown = rows.filter((t) => !person || (person === "team" ? !t.assignee_id : t.assignee_id === person));
  const progress: Record<string, EveryoneProgress[]> = await getEveryoneProgress(await createClient(), shown);
  const nameRecord = Object.fromEntries(names);
  const options = ventures.map((v) => ({ id: v.id, name: v.name }));

  if (!ventures.length) {
    return (
      <div className="empty">
        <p>No ventures yet.</p>
        {isAdmin && <Link href="/ventures/manage" className="btn btn-secondary">Add ventures</Link>}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {ventures.map((v) => {
        const mine = shown.filter((t) => t.venture_id === v.id);
        const open = mine.filter((t) => !t.completed_at);
        const done = mine.filter((t) => t.completed_at);
        const item = (t: Task) => (
          <TaskItem
            key={t.id}
            task={t}
            canCheck={isAdmin || t.assignee_id === null || t.assignee_id === meId}
            progress={progress[t.id]}
            meId={meId}
            isAdmin={isAdmin}
            assignees={people}
            ventures={options}
            names={nameRecord}
            today={today}
            showAssignee
            showVenture={false}
          />
        );
        return (
          <section key={v.id} className="card space-y-4">
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-3">
                <h2 className="section-title break-words">{v.name}</h2>
                <StatusPill status={v.status} />
              </div>
              {v.description && <p className="whitespace-pre-line break-words text-sm text-muted">{v.description}</p>}
              <p className="text-sm">
                <span className="text-muted">Run by </span>
                {v.lead ?? <span className="text-faint">no one yet</span>}
                {v.coLeads.length > 0 && (
                  <>
                    <span className="text-muted"> · Co-leads </span>
                    {v.coLeads.map((c) => c.name).join(", ")}
                  </>
                )}
              </p>
              {hasTimeline(v) && <Timeline start={v.startDate} target={v.targetDate} today={today} />}
              <ProgressBar done={done.length} total={mine.length} />
            </div>

            {isAdmin && (
              <details className="rounded-control border border-line px-3 py-2">
                <summary className="cursor-pointer text-label font-medium text-muted hover:text-fg">Edit details</summary>
                <div className="mt-3">
                  <VentureForm venture={v} people={people} />
                </div>
              </details>
            )}

            {open.length > 0 ? (
              <ul className="space-y-2">{open.map(item)}</ul>
            ) : (
              <p className="text-sm text-muted">{mine.length ? "Every task is done." : "No tasks yet."}</p>
            )}
            {isAdmin && (
              <details className="rounded-control border border-line px-3 py-2">
                <summary className="cursor-pointer text-label font-medium text-muted hover:text-fg">+ Add a task</summary>
                <div className="mt-3">
                  <QuickAddTask ventureId={v.id} people={people} />
                </div>
              </details>
            )}
            {done.length > 0 && (
              <details>
                <summary className="cursor-pointer text-label text-muted hover:text-fg">Done ({done.length})</summary>
                <ul className="mt-3 space-y-2">{done.map(item)}</ul>
              </details>
            )}
          </section>
        );
      })}
    </div>
  );
}
