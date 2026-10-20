import type { Metadata } from "next";
import { ProjectForm } from "@/components/project-form";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createProject } from "../actions";
import { activeAssignees, projectDivisions } from "../assignees";

export const metadata: Metadata = { title: "New project" };

export default async function NewProjectPage({ searchParams }: PageProps<"/projects/new">) {
  await requireAdmin();
  const { division } = await searchParams;
  const supabase = await createClient();
  const [assignees, divisions] = await Promise.all([activeAssignees(supabase), projectDivisions(supabase)]);
  // The map's "+" on a spoke opens this page with that division picked.
  const defaultDivision = divisions.some((d) => d.id === division) ? (division as string) : undefined;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="page-title">New project</h1>
      <p className="text-sm text-muted">
        Only the person you assign it to (and admins) can see it. They tick items off; you control the list.
      </p>
      <div className="card">
        <ProjectForm
          action={createProject}
          assignees={assignees}
          divisions={divisions}
          defaultDivision={defaultDivision}
          submitLabel="Create project"
        />
      </div>
    </div>
  );
}
