"use server";

import { createClient } from "@supabase/supabase-js";
import { siteUrl } from "@/lib/site-url";
import type { FormState } from "@/components/form-message";

export async function sendResetLink(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Enter your email." };

  // "implicit" flow so the reset link works on any device, not only the
  // browser that asked for it. It lands on /auth/callback.
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { flowType: "implicit", persistSession: false, autoRefreshToken: false } },
  );
  await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${await siteUrl()}/auth/callback` });

  // Same answer either way, so this can't be used to find out who has an account.
  return { message: "If that email has an account, a reset link is on its way." };
}
