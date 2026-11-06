"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getProfile } from "@/lib/auth";
import { isReasonableDate } from "@/lib/dates";
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

// Fix the text of a logged call, text or note. The database decides who may
// edit what, and keeps stage changes and reassignments locked.
export async function editActivity(activityId: number, body: string): Promise<{ error?: string }> {
  await getProfile();
  const parsed = LogSchema.shape.body.safeParse(body);
  if (!parsed.success) return { error: "That entry is too long." };

  const supabase = await createClient();
  const { data: current } = await supabase
    .from("activities")
    .select("type")
    .eq("id", activityId)
    .maybeSingle<{ type: string }>();
  if (!current) return { error: "That entry doesn't exist anymore. Refresh and try again." };
  if (current.type === "note" && !parsed.data) return { error: "A note can't be empty." };

  const { data, error } = await supabase
    .from("activities")
    .update({ body: parsed.data || null })
    .eq("id", activityId)
    .select("id");
  if (error) return { error: friendlyDbError(error) };
  if (!data.length) return { error: "You can only edit entries you logged." };

  revalidatePath("/", "layout");
  return {};
}

export async function setFollowUp(leadId: string, date: string | null): Promise<{ error?: string }> {
  await getProfile();
  if (date !== null && !isReasonableDate(date)) return { error: "Pick a valid date." };

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
