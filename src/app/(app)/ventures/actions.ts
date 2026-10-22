"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/components/form-message";
import { requireAdmin } from "@/lib/auth";
import { friendlyDbError } from "@/lib/leads";
import { VENTURE_FIELDS, parseVentureForm } from "@/lib/ventures";
import { createClient } from "@/lib/supabase/server";

// Admins fill in what a venture is, who runs it and its timeline. RLS
// enforces the same rule in the database. Tasks on a venture are added with
// the task actions (see ../tasks/actions.ts).

export async function updateVenture(ventureId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const fields = Object.fromEntries(VENTURE_FIELDS.map((f) => [f, String(formData.get(f) ?? "")]));
  if (!z.guid().safeParse(ventureId).success) return { error: "Venture not found.", fields };
  const parsed = parseVentureForm(formData);
  if (!parsed.ok) return { error: parsed.error, fields };

  const supabase = await createClient();
  const { data: current } = await supabase.from("ventures").select("lead_id").eq("id", ventureId).maybeSingle();
  if (!current) return { error: "Venture not found.", fields };

  // Only check when it changes, so a venture can still be saved while the
  // person running it is deactivated.
  const lead = parsed.data.lead_id;
  if (lead && lead !== current.lead_id) {
    const { data: member } = await supabase.from("profiles").select("active").eq("id", lead).maybeSingle();
    if (!member?.active) return { error: "That person isn't an active team member.", fields };
  }

  const { error } = await supabase.from("ventures").update(parsed.data).eq("id", ventureId);
  if (error) return { error: friendlyDbError(error), fields };

  revalidatePath("/", "layout");
  return { message: "Saved.", fields };
}
