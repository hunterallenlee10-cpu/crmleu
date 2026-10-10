"use server";

import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/components/form-message";

export async function sendResetLink(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Enter your email." };

  const supabase = await createClient();
  // The email links to /auth/confirm (see supabase/templates/recovery.html).
  await supabase.auth.resetPasswordForEmail(email);

  // Same answer either way, so this can't be used to find out who has an account.
  return { message: "If that email has an account, a reset link is on its way." };
}
