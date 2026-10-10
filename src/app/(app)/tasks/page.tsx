import type { Metadata } from "next";
import Link from "next/link";
import { getProfile } from "@/lib/auth";
import { addDays, todayNY } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { getTeamMembers } from "@/lib/team";
import type { Task } from "@/lib/types";
import { TaskForm } from "./task-form";
import { TaskItem } from "./task-item";

export const metadata: Metadata = { title: "Tasks" };

const DONE_WINDOW_DAYS = 30;

// Everyone sees every task, grouped by who it's assigned to. Members tick off
// their own and whole-team tasks; the admin adds, edits and assigns them.
export default async function TasksPage({ searchParams }: PageProps<"/tasks">) {
  const me = await getProfile();
  const isAdmin = me.role === "admin";
  const mineOnly = (await searchParams).view === "mine";
  const today = todayNY();
  const doneSince = addDays(today, -DONE_WINDOW_DAYS);

  const supabase = await createClient();
  const query = supabase
    .from("tasks")
    .select("*")
    .or(`completed_at.is.null,completed_at.gte.${doneSince}`)
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at");

  const [{ data }, members] = await Promise.all([query.returns<Task[]>(), getTeamMembers(supabase)]);
  const tasks = (data ?? []).filter((t) => !mineOnly || t.assignee_id === null || t.assignee_id === me.id);

  const names = Object.fromEntries(members.map((m) => [m.id, m.full_name]));
  const assignees = members.filter((m) => m.active).map((m) => ({ id: m.id, name: m.full_name }));

  // Me first, then whole-team tasks, then everyone else A–Z.
  const groups: { key: string; title: string; tasks: Task[]; empty?: string }[] = [
    { key: me.id, title: "Your tasks", tasks: tasks.filter((t) => t.assignee_id === me.id), empty: "Nothing assigned to you." },
    { key: "team", title: "Whole team", tasks: tasks.filter((t) => t.assignee_id === null) },
    ...members
      .filter((m) => m.id !== me.id)
      .map((m) => ({
        key: m.id,
        title: m.active ? m.full_name : `${m.full_name} (inactive)`,
        tasks: tasks.filter((t) => t.assignee_id === m.id),
      })),
  ].filter((g) => g.tasks.length > 0 || g.empty);

  const myOpen = tasks.filter((t) => !t.completed_at && (t.assignee_id === me.id || t.assignee_id === null)).length;

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">Tasks</h1>
          <p className="mt-1 text-muted">
            {myOpen === 0 ? "You're all caught up." : `${myOpen} open task${myOpen === 1 ? "" : "s"} for you.`}
          </p>
        </div>
        <nav className="flex gap-2" aria-label="Show">
          {[
            { href: "/tasks", label: "Everyone", active: !mineOnly },
            { href: "/tasks?view=mine", label: "Mine", active: mineOnly },
          ].map((f) => (
            <Link
              key={f.href}
              href={f.href}
              aria-current={f.active ? "page" : undefined}
              className={`rounded-full border px-4 py-2.5 text-sm font-medium ${
                f.active ? "border-gold bg-gold text-black" : "border-line text-muted hover:text-fg"
              }`}
            >
              {f.label}
            </Link>
          ))}
        </nav>
      </div>

      {isAdmin && (
        <details className="card group" open={tasks.length === 0}>
          <summary className="cursor-pointer list-none text-lg font-semibold [&::-webkit-details-marker]:hidden">
            <span className="text-gold group-open:hidden">+ </span>New task
          </summary>
          <div className="mt-4">
            <TaskForm assignees={assignees} />
          </div>
        </details>
      )}

      {groups.map((g) => {
        const open = g.tasks.filter((t) => !t.completed_at);
        const done = g.tasks
          .filter((t) => t.completed_at)
          .sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""));
        const item = (t: Task) => (
          <TaskItem
            key={t.id}
            task={t}
            canCheck={isAdmin || t.assignee_id === null || t.assignee_id === me.id}
            isAdmin={isAdmin}
            assignees={assignees}
            names={names}
            today={today}
          />
        );
        return (
          <section key={g.key} className="space-y-3">
            <h2 className={`text-sm font-semibold uppercase tracking-wider ${g.key === me.id ? "text-gold" : "text-fg"}`}>
              {g.title} <span className="text-muted">({open.length} open)</span>
            </h2>
            {open.length > 0 ? (
              <ul className="space-y-3">{open.map(item)}</ul>
            ) : (
              <p className="text-sm text-muted">{g.tasks.length === 0 ? g.empty : "All done."}</p>
            )}
            {done.length > 0 && (
              <details className="space-y-3">
                <summary className="cursor-pointer text-sm text-muted hover:text-fg">
                  Done in the last {DONE_WINDOW_DAYS} days ({done.length})
                </summary>
                <ul className="mt-3 space-y-3">{done.map(item)}</ul>
              </details>
            )}
          </section>
        );
      })}
    </div>
  );
}
