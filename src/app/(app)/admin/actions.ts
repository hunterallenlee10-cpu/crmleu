"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { friendlyDbError } from "@/lib/leads";
import { createClient } from "@/lib/supabase/server";

// Admin-only lead actions. Each one checks the role itself, and RLS also
// refuses these writes for anyone who isn't an admin.

const Ids = z.array(z.uuid()).min(1).max(1000);

// Give leads to a new owner. The database logs a "reassignment" activity on
// each lead whose owner actually changes.
export async function reassignLeads(
  leadIds: string[],
  ownerId: string,
): Promise<{ error?: string; count?: number }> {
  await requireAdmin();
  const ids = Ids.safeParse(leadIds);
  if (!ids.success) return { error: "Pick at least one lead." };
  if (!z.uuid().safeParse(ownerId).success) return { error: "Pick who should own them." };

  const supabase = await createClient();
  const { data: owner } = await supabase.from("profiles").select("active").eq("id", ownerId).maybeSingle();
  if (!owner?.active) return { error: "That person isn't an active team member." };

  const { data, error } = await supabase
    .from("leads")
    .update({ owner_id: ownerId })
    .in("id", ids.data)
    .or(`owner_id.is.null,owner_id.neq.${ownerId}`) // skip leads they already own
    .select("id");
  if (error) return { error: friendlyDbError(error) };

  revalidatePath("/", "layout");
  return { count: data.length };
}

export async function deleteLead(leadId: string): Promise<{ error?: string }> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("leads").delete().eq("id", leadId);
  if (error) return { error: friendlyDbError(error) };
  revalidatePath("/", "layout");
  redirect("/leads");
}

export async function deleteActivity(activityId: number): Promise<{ error?: string }> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("activities").delete().eq("id", activityId);
  if (error) return { error: friendlyDbError(error) };
  revalidatePath("/", "layout");
  return {};
}
