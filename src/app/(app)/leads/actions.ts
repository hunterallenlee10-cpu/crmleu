"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getProfile } from "@/lib/auth";
import {
  changeLeadStage,
  findDuplicate,
  formFields,
  friendlyDbError,
  parseLeadForm,
  type StageChange,
} from "@/lib/leads";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/components/form-message";

// Every action re-checks the session, and the database's RLS decides what
// this user can actually touch.

export async function createLead(_prev: FormState, formData: FormData): Promise<FormState> {
  const profile = await getProfile();
  const fields = formFields(formData);
  const parsed = parseLeadForm(formData);
  if (!parsed.ok) return { error: parsed.error, fields };

  const supabase = await createClient();
  const duplicate = await findDuplicate(supabase, parsed.data);
  if (duplicate) return { error: duplicate, fields };

  const { data, error } = await supabase
    .from("leads")
    .insert({ ...parsed.data, owner_id: profile.id, source: "manual" })
    .select("id")
    .single();
  if (error) return { error: friendlyDbError(error), fields };

  revalidatePath("/", "layout");
  redirect(`/leads/${data.id}`);
}

export async function updateLead(
  leadId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await getProfile();
  const fields = formFields(formData);
  const parsed = parseLeadForm(formData);
  if (!parsed.ok) return { error: parsed.error, fields };

  const supabase = await createClient();
  const duplicate = await findDuplicate(supabase, parsed.data, leadId);
  if (duplicate) return { error: duplicate, fields };

  const { data, error } = await supabase
    .from("leads")
    .update(parsed.data)
    .eq("id", leadId)
    .select("id");
  if (error) return { error: friendlyDbError(error), fields };
  if (!data.length) return { error: "Lead not found.", fields };

  revalidatePath("/", "layout");
  return { message: "Saved.", fields };
}

export async function changeStage(leadId: string, change: StageChange): Promise<{ error?: string }> {
  await getProfile();
  const supabase = await createClient();
  const result = await changeLeadStage(supabase, leadId, change);
  if (!result.error) revalidatePath("/", "layout");
  return result;
}

const LogSchema = z.object({
  type: z.enum(["call", "text", "email", "meeting", "note"]),
  body: z.string().trim().max(5000),
});

export async function logActivity(
  leadId: string,
  type: string,
  body: string,
): Promise<{ error?: string }> {
  const profile = await getProfile();
  const parsed = LogSchema.safeParse({ type, body });
  if (!parsed.success) return { error: "That entry isn't valid." };
  if (parsed.data.type === "note" && !parsed.data.body) return { error: "Write a note first." };

  const supabase = await createClient();
  const { error } = await supabase.from("activities").insert({
    lead_id: leadId,
    user_id: profile.id,
    type: parsed.data.type,
    body: parsed.data.body || null,
  });
  if (error) return { error: friendlyDbError(error) };

  revalidatePath("/", "layout");
  return {};
}

export async function setFollowUp(leadId: string, date: string | null): Promise<{ error?: string }> {
  await getProfile();
  if (date !== null && !z.iso.date().safeParse(date).success) return { error: "Pick a valid date." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leads")
    .update({ next_follow_up: date })
    .eq("id", leadId)
    .select("id");
  if (error) return { error: friendlyDbError(error) };
  if (!data.length) return { error: "Lead not found." };

  revalidatePath("/", "layout");
  return {};
}
