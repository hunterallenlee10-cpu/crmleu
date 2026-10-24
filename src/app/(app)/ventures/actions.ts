"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/components/form-message";
import { requireAdmin } from "@/lib/auth";
import { friendlyDbError } from "@/lib/leads";
import { MAX_CO_LEADS } from "@/lib/promotions";
import { VENTURE_FIELDS, parseCoLeads, parseVentureForm } from "@/lib/ventures";
import { createClient } from "@/lib/supabase/server";

// Admins fill in what a venture is, its lead and co-leads, and its timeline.
// RLS enforces the same rule in the database. Tasks on a venture are added
// with the task actions (see ../tasks/actions.ts).

const NEEDS_MIGRATION = "The database needs updating first. Run `npx supabase db push`, then try again.";

export async function updateVenture(ventureId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const ticked = formData.getAll("co_lead_ids").map(String);
  const fields: Record<string, string> = {
    ...Object.fromEntries(VENTURE_FIELDS.map((f) => [f, String(formData.get(f) ?? "")])),
    co_lead_ids: ticked.join(","),
  };
  if (!z.guid().safeParse(ventureId).success) return { error: "Venture not found.", fields };
  const parsed = parseVentureForm(formData);
  if (!parsed.ok) return { error: parsed.error, fields };
  const lead = parsed.data.lead_id;
  const coLeads = parseCoLeads(ticked, lead);
  if (!coLeads.ok) return { error: coLeads.error, fields };

  const supabase = await createClient();
  const [{ data: current }, { data: currentCo, error: coError }] = await Promise.all([
    supabase.from("ventures").select("lead_id").eq("id", ventureId).maybeSingle(),
    supabase.from("venture_co_leads").select("user_id").eq("venture_id", ventureId),
  ]);
  if (!current) return { error: "Venture not found.", fields };
  // Before the co-leads migration has run the table is missing; the rest of
  // the form still saves as long as nobody is ticked.
  const before = coError ? [] : (currentCo ?? []).map((c) => c.user_id as string);
  const changed = before.length !== coLeads.ids.length || coLeads.ids.some((id) => !before.includes(id));
  if (coError && coLeads.ids.length) return { error: NEEDS_MIGRATION, fields };

  // Only check people being added, so a venture can still be saved while
  // someone already on it is deactivated.
  const added = [...(lead && lead !== current.lead_id ? [lead] : []), ...coLeads.ids.filter((id) => !before.includes(id))];
  if (added.length) {
    const { data: members } = await supabase.from("profiles").select("id, active").in("id", added);
    const active = new Set((members ?? []).filter((m) => m.active).map((m) => m.id));
    if (!added.every((id) => active.has(id))) return { error: "That person isn't an active team member.", fields };
  }

  const { error } = await supabase.from("ventures").update(parsed.data).eq("id", ventureId);
  if (error) return { error: friendlyDbError(error), fields };

  if (changed && !coError) {
    const { error: saveError } = await supabase.rpc("set_venture_co_leads", { p_venture: ventureId, p_people: coLeads.ids });
    if (saveError) {
      if (saveError.code === "PGRST202" || saveError.code === "42883") return { error: NEEDS_MIGRATION, fields };
      if (saveError.code === "23514") return { error: `A venture can have up to ${MAX_CO_LEADS} co-leads.`, fields };
      return { error: friendlyDbError(saveError), fields };
    }
  }

  revalidatePath("/", "layout");
  return { message: "Saved.", fields };
}
