"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getProfile, requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/components/form-message";

// Only admins create, edit and delete tasks. Anyone can tick off their own
// (or whole-team) tasks; the database enforces both rules.

const TaskSchema = z.object({
  title: z.string().trim().min(1, "Give the task a title.").max(200, "Keep the title under 200 characters."),
  details: z
    .string()
    .trim()
    .max(2000, "Keep the details under 2,000 characters.")
    .transform((s) => s || null),
  assignee_id: z
    .union([z.uuid(), z.literal("")])
    .transform((s) => s || null),
  due_date: z
    .union([z.iso.date("Pick a valid due date."), z.literal("")])
    .transform((s) => s || null),
  everyone_must_complete: z.string().transform((s) => s === "on"),
}).transform((t) => ({
  ...t,
  // Only whole-team tasks can need everyone to tick them.
  everyone_must_complete: t.everyone_must_complete && t.assignee_id === null,
}));

function taskFields(formData: FormData) {
  return {
    title: String(formData.get("title") ?? ""),
    details: String(formData.get("details") ?? ""),
    assignee_id: String(formData.get("assignee_id") ?? ""),
    due_date: String(formData.get("due_date") ?? ""),
    everyone_must_complete: formData.get("everyone_must_complete") === "on" ? "on" : "",
  };
}

type TaskInput = z.infer<typeof TaskSchema>;
type Parsed = { fields: Record<string, string> } & ({ ok: true; data: TaskInput } | { ok: false; error: string });

// `currentAssignee` lets an edit keep a task with someone who has since been deactivated.
async function parseTask(formData: FormData, currentAssignee?: string | null): Promise<Parsed> {
  const fields = taskFields(formData);
  const parsed = TaskSchema.safeParse(fields);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message, fields };

  if (parsed.data.assignee_id && parsed.data.assignee_id !== currentAssignee) {
    const supabase = await createClient();
    const { data: member } = await supabase
      .from("profiles")
      .select("active")
      .eq("id", parsed.data.assignee_id)
      .maybeSingle();
    if (!member?.active) return { ok: false, error: "That person isn't an active team member.", fields };
  }
  return { ok: true, data: parsed.data, fields };
}

export async function createTask(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = await parseTask(formData);
  if (!parsed.ok) return { error: parsed.error, fields: parsed.fields };

  const supabase = await createClient();
  const { error } = await supabase.from("tasks").insert(parsed.data);
  if (error) return { error: error.message, fields: parsed.fields };

  revalidatePath("/", "layout");
  return { message: "Task added." };
}

export async function updateTask(taskId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const supabase = await createClient();
  const { data: current } = await supabase.from("tasks").select("assignee_id").eq("id", taskId).maybeSingle();
  const parsed = await parseTask(formData, current?.assignee_id);
  if (!parsed.ok) return { error: parsed.error, fields: parsed.fields };

  const { data, error } = await supabase.from("tasks").update(parsed.data).eq("id", taskId).select("id");
  if (error) return { error: error.message, fields: parsed.fields };
  if (!data.length) return { error: "Task not found.", fields: parsed.fields };

  revalidatePath("/", "layout");
  return { message: "Saved.", fields: parsed.fields };
}

export async function deleteTask(taskId: string): Promise<{ error?: string }> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("tasks").delete().eq("id", taskId);
  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  return {};
}

export async function setTaskDone(taskId: string, done: boolean): Promise<{ error?: string }> {
  await getProfile();
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_task_done", { p_task_id: taskId, p_done: done });
  if (error) {
    if (error.code !== "42501") return { error: error.message };
    return {
      error: error.message.startsWith("Each rep")
        ? "Each rep ticks this one off for themselves."
        : "Only the person it's assigned to can tick this off.",
    };
  }

  revalidatePath("/", "layout");
  return {};
}
