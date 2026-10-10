import "server-only";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

// Niches for dropdowns and suggestions. Reps only see their own leads' niches.
export async function getNiches(supabase: Supabase): Promise<string[]> {
  const { data } = await supabase.from("lead_niches").select("niche");
  return (data ?? []).map((r) => r.niche as string);
}
