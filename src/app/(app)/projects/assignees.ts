import "server-only";
import type { AssigneeOption } from "@/components/project-form";
import type { createClient } from "@/lib/supabase/server";
import type { ProjectDivision } from "@/lib/types";

type Supabase = Awaited<ReturnType<typeof createClient>>;

// Active team members to assign a project to. If the project's current
// assignee has been deactivated, they're kept in the list so saving the
// form doesn't quietly unassign them.
export async function activeAssignees(supabase: Supabase, currentId?: string | null): Promise<AssigneeOption[]> {
  const { data } = await supabase.from("team_members").select("id, full_name, active").order("full_name");
  return (data ?? [])
    .filter((m) => m.active || m.id === currentId)
    .map((m) => ({
      value: m.id as string,
      label: `${m.full_name}${m.active ? "" : " (inactive)"}`,
    }));
}

// Divisions in map order (clockwise from the top).
export async function projectDivisions(supabase: Supabase): Promise<ProjectDivision[]> {
  const { data } = await supabase
    .from("project_divisions")
    .select("*")
    .order("position")
    .order("created_at")
    .returns<ProjectDivision[]>();
  return data ?? [];
}
