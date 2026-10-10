"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
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
