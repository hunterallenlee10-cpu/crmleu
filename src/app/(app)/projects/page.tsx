import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { ProjectRow, type ProjectSummary } from "@/components/project-row";
import { getProfile } from "@/lib/auth";
import { todayNY } from "@/lib/dates";
import { progress } from "@/lib/projects";
import { createClient } from "@/lib/supabase/server";
import type { Project } from "@/lib/types";
import { PersonFilter } from "./person-filter";

export const metadata: Metadata = { title: "Projects" };

type Row = Project & { project_tasks: { done: boolean }[] };

export default async function ProjectsPage({ searchParams }: PageProps<"/projects">) {
  const profile = await getProfile();
  const isAdmin = profile.role === "admin";
  const { person } = await searchParams;
  const personFilter =
    typeof person === "string" && (person === "unassigned" || z.guid().safeParse(person).success) ? person : "";
  const supabase = await createClient();

  // RLS limits reps to projects assigned to them; admins see everything.
  let query = supabase
    .from("projects")
    .select("*, project_tasks(done)")
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (isAdmin && personFilter === "unassigned") query = query.is("assignee_id", null);
  else if (isAdmin && personFilter) query = query.eq("assignee_id", personFilter);

  const [{ data }, { data: team }] = await Promise.all([
    query.returns<Row[]>(),
    supabase.from("team_members").select("id, full_name, active").order("full_name"),
  ]);

  const names = new Map((team ?? []).map((m) => [m.id as string, m.full_name as string]));
  const today = todayNY();
  const projects: (ProjectSummary & { assignee_id: string | null })[] = (data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    due_date: p.due_date,
    assignee_id: p.assignee_id,
    ...progress(p.project_tasks),
  }));
  const open = projects.filter((p) => !p.complete);
  const done = projects.filter((p) => p.complete);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Projects</h1>
          <p className="mt-1 text-muted">
            {isAdmin ? "Hand out projects and track each checklist." : "Projects assigned to you. Tick items off as you go."}
          </p>
        </div>
        {isAdmin && <Link href="/projects/new" className="btn btn-gold">+ New project</Link>}
      </div>

      {isAdmin && (
        <PersonFilter
          value={personFilter}
          people={(team ?? []).map((m) => ({
            value: m.id as string,
            label: `${m.full_name}${m.active ? "" : " (inactive)"}`,
          }))}
        />
      )}

      {projects.length === 0 ? (
        <p className="text-sm text-muted">
          {isAdmin
            ? personFilter
              ? "No projects here."
              : "No projects yet. Create one to delegate work to your team."
            : "No projects assigned to you yet."}
        </p>
      ) : (
        <>
          <List title="In progress" items={open} today={today} names={isAdmin ? names : undefined} />
          <List title="Done" items={done} today={today} names={isAdmin ? names : undefined} />
        </>
      )}
    </div>
  );
}

function List({
  title,
  items,
  today,
  names,
}: {
  title: string;
  items: (ProjectSummary & { assignee_id: string | null })[];
  today: string;
  names?: Map<string, string>;
}) {
  if (!items.length) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">
        {title} <span className="text-muted/70">({items.length})</span>
      </h2>
      <div className="grid gap-3 md:grid-cols-2">
        {items.map((p) => (
          <ProjectRow
            key={p.id}
            project={p}
            today={today}
            assignee={names ? (p.assignee_id ? names.get(p.assignee_id) ?? "Unknown" : "Unassigned") : undefined}
          />
        ))}
      </div>
    </section>
  );
}
