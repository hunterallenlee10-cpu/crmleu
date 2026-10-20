import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { ProjectRow } from "@/components/project-row";
import { getProfile } from "@/lib/auth";
import { todayNY } from "@/lib/dates";
import { personColor } from "@/lib/project-map";
import { progress } from "@/lib/projects";
import { createClient } from "@/lib/supabase/server";
import type { Project, ProjectTask } from "@/lib/types";
import { projectDivisions } from "./assignees";
import { ProjectMap, type MapProject, type MapSpoke } from "./project-map";
import { PersonChips, ViewSwitch, type PersonChip } from "./projects-toolbar";

export const metadata: Metadata = { title: "Projects" };

type Row = Project & { project_tasks: Pick<ProjectTask, "id" | "title" | "done" | "position">[] };

// Projects without a division (made before divisions existed) get their own spoke.
const UNSORTED = "unsorted";

export default async function ProjectsPage({ searchParams }: PageProps<"/projects">) {
  const profile = await getProfile();
  const isAdmin = profile.role === "admin";
  const { person, view: viewParam } = await searchParams;
  const personFilter =
    isAdmin && typeof person === "string" && (person === "unassigned" || z.guid().safeParse(person).success)
      ? person
      : "";
  const view = viewParam === "list" ? "list" : "map";
  const supabase = await createClient();

  // RLS limits reps to projects assigned to them; admins see everything.
  // Everything is loaded so the map can fade (not hide) other people's work.
  const [{ data }, { data: team }, divisions] = await Promise.all([
    supabase
      .from("projects")
      .select("*, project_tasks(id, title, done, position)")
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false })
      .returns<Row[]>(),
    supabase.from("team_members").select("id, full_name, active").order("full_name"),
    projectDivisions(supabase),
  ]);

  const members = team ?? [];
  const names = new Map(members.map((m) => [m.id as string, m.full_name as string]));
  const colorIndex = new Map(members.map((m, i) => [m.id as string, i]));
  const rows = data ?? [];
  const today = todayNY();

  const spokes: MapSpoke[] = divisions.map((d) => ({ id: d.id, name: d.name }));
  if (rows.some((p) => !p.division_id)) spokes.push({ id: UNSORTED, name: "No division", isUnsorted: true });

  const projects: MapProject[] = rows.map((p) => ({
    id: p.id,
    name: p.name,
    spokeId: p.division_id ?? UNSORTED,
    assigneeId: p.assignee_id,
    assignee: !p.assignee_id
      ? "Unassigned"
      : p.assignee_id === profile.id
        ? "You"
        : names.get(p.assignee_id) ?? "Unknown",
    color: personColor(p.assignee_id ? colorIndex.get(p.assignee_id) ?? -1 : -1),
    dueDate: p.due_date,
    tasks: [...p.project_tasks]
      .sort((a, b) => a.position - b.position || a.id - b.id)
      .map((t) => ({ id: t.id, title: t.title, done: t.done })),
  }));

  // Admins filter by anyone who has a project.
  const isOpen = (p: MapProject) => !progress(p.tasks).complete;
  const chips: PersonChip[] = [];
  if (isAdmin) {
    for (const m of members) {
      const theirs = projects.filter((p) => p.assigneeId === m.id);
      if (theirs.length) {
        chips.push({
          value: m.id as string,
          label: `${m.full_name}${m.active ? "" : " (inactive)"}`,
          color: personColor(colorIndex.get(m.id as string) ?? -1),
          count: theirs.filter(isOpen).length,
        });
      }
    }
    const unassigned = projects.filter((p) => !p.assigneeId);
    if (unassigned.length) {
      chips.push({ value: "unassigned", label: "Unassigned", color: personColor(-1), count: unassigned.filter(isOpen).length });
    }
  }

  const list = (
    <ProjectList
      spokes={spokes}
      projects={projects}
      person={personFilter}
      isAdmin={isAdmin}
      today={today}
    />
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="page-title">Projects</h1>
          <p className="mt-1.5 text-muted">
            {isAdmin
              ? "Hand out projects and track each checklist. Every project moves toward LEU as its work gets done."
              : "Projects assigned to you. Tick items off as you go."}
          </p>
        </div>
        {isAdmin && (
          <div className="flex flex-wrap gap-2">
            <Link href="/projects/divisions" className="btn btn-secondary">Edit divisions</Link>
            <Link href="/projects/new" className="btn btn-primary">+ New project</Link>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        {isAdmin ? (
          <PersonChips value={personFilter} people={chips} total={projects.filter(isOpen).length} />
        ) : (
          <span />
        )}
        <ViewSwitch value={view} />
      </div>

      {view === "list" ? (
        list
      ) : (
        <>
          <div className="hidden md:block">
            <ProjectMap
              spokes={spokes}
              projects={projects}
              person={personFilter}
              isAdmin={isAdmin}
              meId={profile.id}
              today={today}
            />
          </div>
          <div className="md:hidden">{list}</div>
        </>
      )}
    </div>
  );
}

// The same projects, grouped by division. Phones always get this view.
function ProjectList({
  spokes,
  projects,
  person,
  isAdmin,
  today,
}: {
  spokes: MapSpoke[];
  projects: MapProject[];
  person: string;
  isAdmin: boolean;
  today: string;
}) {
  const shown = projects.filter(
    (p) => !person || (person === "unassigned" ? !p.assigneeId : p.assigneeId === person),
  );
  const groups = spokes
    .map((s) => {
      const items = shown
        .filter((p) => p.spokeId === s.id)
        .map((p) => ({ ...p, ...progress(p.tasks) }))
        .sort((a, b) => Number(a.complete) - Number(b.complete));
      return { spoke: s, items };
    });
  const filled = groups.filter((g) => g.items.length);
  const empty = groups.filter((g) => !g.items.length && !g.spoke.isUnsorted);

  if (!filled.length) {
    return (
      <div className="empty">
        <p>
          {isAdmin
            ? person
              ? "No projects for this person."
              : "No projects yet. Create one to delegate work to your team."
            : "No projects assigned to you yet."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {filled.map(({ spoke, items }) => (
        <section key={spoke.id} className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              {spoke.name}
              <span className="count">{items.filter((p) => !p.complete).length}</span>
            </h2>
            {isAdmin && !spoke.isUnsorted && (
              <Link href={`/projects/new?division=${spoke.id}`} className="btn btn-ghost min-h-9 px-2.5 text-label">
                + Add
              </Link>
            )}
          </div>
          {spoke.isUnsorted && (
            <p className="text-sm text-warning">Made before divisions existed. Open each one and pick a division.</p>
          )}
          <div className="grid gap-3 md:grid-cols-2">
            {items.map((p) => (
              <ProjectRow
                key={p.id}
                project={{ id: p.id, name: p.name, due_date: p.dueDate, done: p.done, total: p.total, complete: p.complete }}
                today={today}
                assignee={isAdmin ? p.assignee : undefined}
              />
            ))}
          </div>
        </section>
      ))}
      {isAdmin && empty.length > 0 && (
        <p className="text-sm text-muted">
          Nobody is working on {empty.map((g) => g.spoke.name).join(", ")} yet.
        </p>
      )}
    </div>
  );
}
