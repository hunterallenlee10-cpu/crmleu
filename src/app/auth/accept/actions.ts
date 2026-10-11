"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Verifying the token logs the rep in; then they choose a password.
export async function acceptInvite(formData: FormData) {
  const tokenHash = String(formData.get("token_hash") ?? "");
  if (tokenHash) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type: "invite", token_hash: tokenHash });
    if (!error) redirect("/set-password");
  }
  redirect("/login?error=link");
}
