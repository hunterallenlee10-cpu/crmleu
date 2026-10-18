import "server-only";
import type { AssigneeOption } from "@/components/project-form";
import type { createClient } from "@/lib/supabase/server";

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
