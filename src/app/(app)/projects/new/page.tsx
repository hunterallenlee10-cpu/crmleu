import type { Metadata } from "next";
import { ProjectForm } from "@/components/project-form";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createProject } from "../actions";
import { activeAssignees } from "../assignees";

export const metadata: Metadata = { title: "New project" };

export default async function NewProjectPage() {
  await requireAdmin();
  const supabase = await createClient();
  const assignees = await activeAssignees(supabase);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">New project</h1>
      <p className="text-sm text-muted">
        Only the person you assign it to (and admins) can see it. They tick items off; you control the list.
      </p>
      <div className="card">
        <ProjectForm action={createProject} assignees={assignees} submitLabel="Create project" />
      </div>
    </div>
  );
}
