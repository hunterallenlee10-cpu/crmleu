"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Verifying the token logs the rep in; then they choose a password.
export async function acceptInvite(_prev: string | undefined, formData: FormData): Promise<string | undefined> {
  const tokenHash = String(formData.get("token_hash") ?? "");
  if (!tokenHash) return "This link is incomplete. Make sure you opened the whole link.";

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type: "invite", token_hash: tokenHash });
  if (error) {
    // Supabase says "invalid or expired" when the token is gone: it was already
    // used, a newer link for the same person replaced it, or it timed out.
    return "This link has already been used, was replaced by a newer link, or has expired. Ask your admin for a new one.";
  }
  redirect("/set-password");
}
