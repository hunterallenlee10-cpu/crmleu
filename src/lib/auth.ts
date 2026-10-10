import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

// The logged-in user's profile. Redirects to /login if there isn't one,
// and signs out deactivated users. Cached for the length of one request.
export const getProfile = cache(async (): Promise<Profile> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, active, commission_rate, created_at")
    .eq("id", userId)
    .single<Profile>();

  if (!profile || !profile.active) redirect("/auth/signout?error=inactive");
  return profile;
});

export async function requireAdmin(): Promise<Profile> {
  const profile = await getProfile();
  if (profile.role !== "admin") redirect("/");
  return profile;
}
