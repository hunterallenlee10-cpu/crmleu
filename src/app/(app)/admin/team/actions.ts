"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { siteUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/components/form-message";

const InviteSchema = z.object({
  full_name: z.string().trim().min(1, "Enter their name."),
  email: z.email("Enter a valid email.").trim().toLowerCase(),
});

export type InviteState = (NonNullable<FormState> & { link?: string }) | undefined;

// Two ways to invite, picked by which button was pressed:
//   "email" - Supabase emails the invite (built-in email allows only 2 an hour).
//   "link"  - no email; the admin gets a link to text the rep themselves.
// Either way the new auth user gets a "rep" profile from the
// on_auth_user_created trigger, using full_name from this metadata.
export async function inviteRep(_prev: InviteState, formData: FormData): Promise<InviteState> {
  await requireAdmin();
  const fields = {
    full_name: String(formData.get("full_name") ?? ""),
    email: String(formData.get("email") ?? ""),
  };

  const parsed = InviteSchema.safeParse(fields);
  if (!parsed.success) return { error: parsed.error.issues[0].message, fields };
  const { full_name, email } = parsed.data;
  const site = await siteUrl();
  const auth = createAdminClient().auth.admin;

  if (formData.get("mode") === "link") {
    const { data, error } = await auth.generateLink({ type: "invite", email, options: { data: { full_name } } });
    if (error) return { error: adminErrorMessage(error.message), fields };

    // Lands on /auth/accept, which waits for a tap before using the one-time
    // token, so a text message's link preview can't use it up.
    const link = `${site}/auth/accept?token_hash=${encodeURIComponent(data.properties.hashed_token)}`;
    revalidatePath("/admin/team");
    return { message: `Invite link for ${full_name} is ready. It works once, so send it only to them, and don't open it yourself.`, link };
  }

  // The emailed link lands on /auth/callback (see that page for why).
  const { error } = await auth.inviteUserByEmail(email, {
    data: { full_name },
    redirectTo: `${site}/auth/callback`,
  });
  if (error) return { error: adminErrorMessage(error.message), fields };

  revalidatePath("/admin/team");
  return { message: `Invite sent to ${email}.` };
}

function adminErrorMessage(message: string): string {
  if (/already|registered|exists/i.test(message)) return "Someone with that email is already on the team.";
  if (/rate limit/i.test(message)) {
    return "Supabase's email limit is used up for now (2 an hour). Use \"Create invite link\" instead, or try again in an hour.";
  }
  if (/invalid api key|legacy api keys/i.test(message)) {
    return "Supabase rejected the server key. Set SUPABASE_SERVICE_ROLE_KEY to this project's secret (service_role) key, then redeploy.";
  }
  return message;
}

// ---------------------------------------------------------------------------
// Managing existing members
// ---------------------------------------------------------------------------

export async function setCommissionRate(memberId: string, rate: number): Promise<{ error?: string }> {
  await requireAdmin();
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) return { error: "Use a rate from 0 to 100." };

  const supabase = await createClient();
  const { data: member } = await supabase.from("profiles").select("role").eq("id", memberId).maybeSingle();
  if (member?.role === "admin") return { error: "Admins don't earn commission." };

  const { error } = await supabase
    .from("profiles")
    .update({ commission_rate: Math.round(rate * 100) / 100 })
    .eq("id", memberId);
  if (error) return { error: error.message };

  revalidatePath("/admin", "layout");
  return {};
}

// Deactivating turns off the profile (RLS then hides all data from them) and
// blocks their login in Supabase Auth. Their leads stay put until reassigned.
export async function setActive(memberId: string, active: boolean): Promise<{ error?: string }> {
  const me = await requireAdmin();
  if (memberId === me.id) return { error: "You can't deactivate yourself." };

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ active }).eq("id", memberId);
  if (error) return { error: error.message };

  const { error: authError } = await createAdminClient().auth.admin.updateUserById(memberId, {
    ban_duration: active ? "none" : "876000h", // ~100 years
  });
  if (authError) return { error: `Saved, but couldn't update their login: ${adminErrorMessage(authError.message)}` };

  revalidatePath("/", "layout");
  return {};
}

// Move every open (not Won/Lost) lead from one person to another.
// Won and Lost leads stay with the original rep so past commission isn't moved.
export async function reassignOpenLeads(fromId: string, toId: string): Promise<{ error?: string; count?: number }> {
  await requireAdmin();
  if (!toId) return { error: "Pick who should get the leads." };
  if (fromId === toId) return { error: "Pick someone else." };

  const supabase = await createClient();
  const { data: target } = await supabase.from("profiles").select("active").eq("id", toId).maybeSingle();
  if (!target?.active) return { error: "That person isn't an active team member." };

  const { data, error } = await supabase
    .from("leads")
    .update({ owner_id: toId })
    .eq("owner_id", fromId)
    .not("stage", "in", "(won,lost)")
    .select("id");
  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  return { count: data.length };
}
