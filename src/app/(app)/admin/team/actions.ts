"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/components/form-message";

const InviteSchema = z.object({
  full_name: z.string().trim().min(1, "Enter their name."),
  email: z.email("Enter a valid email.").trim().toLowerCase(),
});

export async function inviteRep(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const fields = {
    full_name: String(formData.get("full_name") ?? ""),
    email: String(formData.get("email") ?? ""),
  };

  const parsed = InviteSchema.safeParse(fields);
  if (!parsed.success) return { error: parsed.error.issues[0].message, fields };
  const { full_name, email } = parsed.data;

  // Sends the invite email. The new auth user gets a "rep" profile from the
  // on_auth_user_created trigger, using full_name from this metadata.
  const { error } = await createAdminClient().auth.admin.inviteUserByEmail(email, {
    data: { full_name },
  });
  if (error) {
    return {
      error: /already|registered|exists/i.test(error.message)
        ? "Someone with that email is already on the team."
        : error.message,
      fields,
    };
  }

  revalidatePath("/admin/team");
  return { message: `Invite sent to ${email}.` };
}

// ---------------------------------------------------------------------------
// Managing existing members
// ---------------------------------------------------------------------------

export async function setCommissionRate(memberId: string, rate: number): Promise<{ error?: string }> {
  await requireAdmin();
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) return { error: "Use a rate from 0 to 100." };

  const supabase = await createClient();
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
  if (authError) return { error: `Saved, but couldn't update their login: ${authError.message}` };

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
