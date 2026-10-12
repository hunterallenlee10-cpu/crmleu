import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { EveryoneProgress, Task } from "@/lib/types";

type Supabase = Awaited<ReturnType<typeof createClient>>;

// Who has to tick each "everyone" task, and who has. Keyed by task id.
export async function getEveryoneProgress(
  supabase: Supabase,
  tasks: Task[],
): Promise<Record<string, EveryoneProgress[]>> {
  const ids = tasks.filter((t) => t.everyone_must_complete).map((t) => t.id);
  if (ids.length === 0) return {};

  const { data } = await supabase.rpc("everyone_task_progress", { p_task_ids: ids });
  const byTask: Record<string, EveryoneProgress[]> = {};
  for (const row of (data ?? []) as EveryoneProgress[]) (byTask[row.task_id] ??= []).push(row);
  return byTask;
}
