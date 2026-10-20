"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { FormState } from "@/components/form-message";
import { getProfile, requireAdmin } from "@/lib/auth";
import { friendlyDbError } from "@/lib/leads";
import { MAX_TASK_LENGTH, MAX_TASKS, parseChecklist, parseProjectForm } from "@/lib/projects";
import { createClient } from "@/lib/supabase/server";

// Admins create, edit and delete projects and checklist items. The assignee
// can only tick items. Each action checks the role, and RLS plus a trigger
// enforce the same rules in the database.

type Supabase = Awaited<ReturnType<typeof createClient>>;

function projectFields(formData: FormData) {
  const fields: Record<string, string> = {};
  for (const name of ["name", "description", "division_id", "assignee_id", "due_date", "checklist"]) {
    fields[name] = String(formData.get(name) ?? "");
  }
  return fields;
}

async function divisionExists(supabase: Supabase, id: string) {
  const { data } = await supabase.from("project_divisions").select("id").eq("id", id).maybeSingle();
  return Boolean(data);
}

async function isActiveMember(supabase: Supabase, id: string) {
  const { data } = await supabase.from("profiles").select("active").eq("id", id).maybeSingle();
  return Boolean(data?.active);
}

export async function createProject(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const fields = projectFields(formData);
  const parsed = parseProjectForm(formData);
  if (!parsed.ok) return { error: parsed.error, fields };
  const items = parseChecklist(fields.checklist);
  if (items.length > MAX_TASKS) return { error: `Keep the checklist to ${MAX_TASKS} items or fewer.`, fields };

  const supabase = await createClient();
  if (!(await divisionExists(supabase, parsed.data.division_id))) {
    return { error: "That division doesn't exist anymore. Pick another one.", fields };
  }
  if (parsed.data.assignee_id && !(await isActiveMember(supabase, parsed.data.assignee_id))) {
    return { error: "That person isn't an active team member.", fields };
  }

  const { data: project, error } = await supabase
    .from("projects")
    .insert(parsed.data)
    .select("id")
    .single();
  if (error) return { error: friendlyDbError(error), fields };

  if (items.length) {
    const { error: taskError } = await supabase
      .from("project_tasks")
      .insert(items.map((title, position) => ({ project_id: project.id, title, position })));
    if (taskError) {
      await supabase.from("projects").delete().eq("id", project.id);
      return { error: friendlyDbError(taskError), fields };
    }
  }

  revalidatePath("/", "layout");
  redirect(`/projects/${project.id}`);
}

export async function updateProject(
  projectId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAdmin();
  const fields = projectFields(formData);
  const parsed = parseProjectForm(formData);
  if (!parsed.ok) return { error: parsed.error, fields };

  const supabase = await createClient();
  const { data: current } = await supabase
    .from("projects")
    .select("assignee_id")
    .eq("id", projectId)
    .maybeSingle();
  if (!current) return { error: "Project not found.", fields };
  if (!(await divisionExists(supabase, parsed.data.division_id))) {
    return { error: "That division doesn't exist anymore. Pick another one.", fields };
  }

  // Only check when it changes, so a project can still be saved while its
  // assignee is deactivated.
  const assignee = parsed.data.assignee_id;
  if (assignee && assignee !== current.assignee_id && !(await isActiveMember(supabase, assignee))) {
    return { error: "That person isn't an active team member.", fields };
  }

  const { error } = await supabase.from("projects").update(parsed.data).eq("id", projectId);
  if (error) return { error: friendlyDbError(error), fields };

  revalidatePath("/", "layout");
  return { message: "Saved.", fields };
}

export async function deleteProject(projectId: string): Promise<{ error?: string }> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("projects").delete().eq("id", projectId);
  if (error) return { error: friendlyDbError(error) };
  revalidatePath("/", "layout");
  redirect("/projects");
}

// ---------------------------------------------------------------------------
// Checklist
// ---------------------------------------------------------------------------

const TaskId = z.number().int().positive();

// The assignee or an admin ticks an item on or off.
export async function setTaskDone(taskId: number, done: boolean): Promise<{ error?: string }> {
  await getProfile();
  if (!TaskId.safeParse(taskId).success) return { error: "That item isn't valid." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_tasks")
    .update({ done: Boolean(done) })
    .eq("id", taskId)
    .select("id");
  if (error) return { error: friendlyDbError(error) };
  if (!data.length) return { error: "Item not found." };

  revalidatePath("/", "layout");
  return {};
}

// Add one or more items (one per line) to the end of the checklist.
export async function addTasks(projectId: string, text: string): Promise<{ error?: string }> {
  await requireAdmin();
  if (!z.guid().safeParse(projectId).success) return { error: "Project not found." };
  const items = parseChecklist(text);
  if (!items.length) return { error: "Type an item first." };

  const supabase = await createClient();
  const { data: existing, error: readError } = await supabase
    .from("project_tasks")
    .select("position")
    .eq("project_id", projectId)
    .order("position", { ascending: false });
  if (readError) return { error: friendlyDbError(readError) };
  if ((existing?.length ?? 0) + items.length > MAX_TASKS) {
    return { error: `A checklist can have up to ${MAX_TASKS} items.` };
  }

  const start = existing?.length ? existing[0].position + 1 : 0;
  const { error } = await supabase
    .from("project_tasks")
    .insert(items.map((title, i) => ({ project_id: projectId, title, position: start + i })));
  if (error) return { error: friendlyDbError(error) };

  revalidatePath("/", "layout");
  return {};
}

export async function renameTask(taskId: number, title: string): Promise<{ error?: string }> {
  await requireAdmin();
  const clean = title.trim();
  if (!TaskId.safeParse(taskId).success) return { error: "That item isn't valid." };
  if (!clean) return { error: "An item can't be blank." };
  if (clean.length > MAX_TASK_LENGTH) return { error: `Keep items under ${MAX_TASK_LENGTH} characters.` };

  const supabase = await createClient();
  const { error } = await supabase.from("project_tasks").update({ title: clean }).eq("id", taskId);
  if (error) return { error: friendlyDbError(error) };

  revalidatePath("/", "layout");
  return {};
}

export async function deleteTask(taskId: number): Promise<{ error?: string }> {
  await requireAdmin();
  if (!TaskId.safeParse(taskId).success) return { error: "That item isn't valid." };

  const supabase = await createClient();
  const { error } = await supabase.from("project_tasks").delete().eq("id", taskId);
  if (error) return { error: friendlyDbError(error) };

  revalidatePath("/", "layout");
  return {};
}
