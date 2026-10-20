import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ProjectForm } from "@/components/project-form";
import { DueBadge, ProgressBar } from "@/components/project-row";
import { getProfile } from "@/lib/auth";
import { formatDate, todayNY } from "@/lib/dates";
import { progress } from "@/lib/projects";
import { createClient } from "@/lib/supabase/server";
import type { Project, ProjectTask } from "@/lib/types";
import { updateProject } from "../actions";
import { activeAssignees, projectDivisions } from "../assignees";
import { Checklist } from "./checklist";
import { DeleteProjectButton } from "./delete-project";

export const metadata: Metadata = { title: "Project" };

export default async function ProjectPage({ params }: PageProps<"/projects/[id]">) {
  const profile = await getProfile();
  const isAdmin = profile.role === "admin";
  const { id } = await params;
  if (!z.guid().safeParse(id).success) notFound();
  const supabase = await createClient();

  // RLS returns nothing unless this project is assigned to you (or you're an admin).
  const { data: project } = await supabase.from("projects").select("*").eq("id", id).maybeSingle<Project>();
  if (!project) notFound();

  const [{ data: tasks }, { data: team }, assignees, divisions] = await Promise.all([
    supabase
      .from("project_tasks")
      .select("*")
      .eq("project_id", id)
      .order("position")
      .order("id")
      .returns<ProjectTask[]>(),
    supabase.from("team_members").select("id, full_name"),
    isAdmin ? activeAssignees(supabase, project.assignee_id) : Promise.resolve([]),
    projectDivisions(supabase),
  ]);
  const division = divisions.find((d) => d.id === project.division_id);

  const names = new Map((team ?? []).map((m) => [m.id as string, m.full_name as string]));
  const today = todayNY();
  const items = (tasks ?? []).map((t) => ({
    id: t.id,
    title: t.title,
    done: t.done,
    doneNote: t.done && t.done_at ? doneNote(t, names, today) : null,
  }));
  const { done, total, complete } = progress(items);
  const assignee = project.assignee_id ? names.get(project.assignee_id) ?? "Unknown" : "Unassigned";

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div className="space-y-3">
        <h1 className="page-title">{project.name}</h1>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
          <span>
            Assigned to <span className="text-fg">{project.assignee_id === profile.id ? "you" : assignee}</span>
          </span>
          <span aria-hidden>·</span>
          <span>{division ? division.name : "No division"}</span>
          <span aria-hidden>·</span>
          <DueBadge date={project.due_date} today={today} complete={complete} />
        </p>
        <ProgressBar done={done} total={total} />
        {project.description && <p className="whitespace-pre-wrap pt-2">{project.description}</p>}
      </div>

      <Section title="Checklist">
        <Checklist projectId={project.id} items={items} isAdmin={isAdmin} />
      </Section>

      {isAdmin && (
        <>
          <Section title="Details">
            <ProjectForm
              action={updateProject.bind(null, project.id)}
              project={project}
              assignees={assignees}
              divisions={divisions}
              submitLabel="Save changes"
            />
          </Section>
          <Section title="Admin">
            <p className="text-sm text-muted">
              Created {formatDate(todayNY(new Date(project.created_at)), today)}
              {project.created_by && <> by <span className="text-fg">{names.get(project.created_by) ?? "Unknown"}</span></>}
            </p>
            <DeleteProjectButton projectId={project.id} />
          </Section>
        </>
      )}
    </div>
  );
}

function doneNote(t: ProjectTask, names: Map<string, string>, today: string) {
  const who = t.done_by ? names.get(t.done_by) ?? "Someone" : "System";
  const when = formatDate(todayNY(new Date(t.done_at!)), today);
  return `${who} · ${when}`;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card space-y-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}
