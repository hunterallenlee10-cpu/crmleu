import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { Profile, TeamMember } from "@/lib/types";

type Supabase = Awaited<ReturnType<typeof createClient>>;

// Everyone on the team (admins see all profiles; RLS limits reps to themselves).
export async function getTeam(supabase: Supabase): Promise<Profile[]> {
  const { data } = await supabase
    .from("profiles")
    .select("*") // includes title and reports_to once the team_hierarchy migration has run
    .order("full_name")
    .returns<Profile[]>();
  return data ?? [];
}

// Names, titles and who reports to whom for everyone on the team. Readable by
// reps too (no emails or rates).
export async function getTeamMembers(supabase: Supabase): Promise<TeamMember[]> {
  const { data } = await supabase
    .from("team_members")
    .select("*") // includes title and reports_to once the team_hierarchy migration has run
    .order("full_name")
    .returns<TeamMember[]>();
  return data ?? [];
}
