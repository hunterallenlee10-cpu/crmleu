import { z } from "zod";

export const MAX_TASKS = 200;
export const MAX_TASK_LENGTH = 300;

// Turns a pasted list into checklist items: one per line, with bullets,
// numbers and "[ ]" boxes stripped, and blank lines dropped.
export function parseChecklist(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) =>
      line
        .trim()
        .replace(/^(?:[-*•–]\s*)?(?:\[[ xX]?\]\s*)?(?:\d{1,3}[.)]\s+)?/, "")
        .trim()
        .slice(0, MAX_TASK_LENGTH),
    )
    .filter(Boolean);
}

const optionalText = z
  .string()
  .trim()
  .max(5000)
  .transform((v) => v || null);

export const ProjectSchema = z.object({
  name: z.string().trim().min(1, "Give the project a name.").max(200, "Keep the name under 200 characters."),
  description: optionalText,
  assignee_id: z.union([z.guid(), z.literal("")]).transform((v) => v || null),
  due_date: z.union([z.iso.date(), z.literal("")]).transform((v) => v || null),
});

export type ProjectInput = z.infer<typeof ProjectSchema>;

export function parseProjectForm(formData: FormData):
  | { ok: true; data: ProjectInput }
  | { ok: false; error: string } {
  const parsed = ProjectSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
    assignee_id: String(formData.get("assignee_id") ?? ""),
    due_date: String(formData.get("due_date") ?? ""),
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue.path[0];
    if (field === "due_date") return { ok: false, error: "Pick a valid due date." };
    if (field === "assignee_id") return { ok: false, error: "Pick who the project is for." };
    return { ok: false, error: issue.message };
  }
  return { ok: true, data: parsed.data };
}

export function progress(tasks: { done: boolean }[]) {
  const total = tasks.length;
  const done = tasks.filter((t) => t.done).length;
  return { done, total, complete: total > 0 && done === total };
}
