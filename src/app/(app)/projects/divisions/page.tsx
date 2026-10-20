import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { MAX_DIVISIONS } from "@/lib/projects";
import { createClient } from "@/lib/supabase/server";
import type { ProjectDivision } from "@/lib/types";
import { AddDivision, DivisionRow } from "./division-row";

export const metadata: Metadata = { title: "Edit divisions" };

export default async function DivisionsPage() {
  await requireAdmin();
  const supabase = await createClient();
  const [{ data: divisions }, { data: projects }] = await Promise.all([
    supabase
      .from("project_divisions")
      .select("*")
      .order("position")
      .order("created_at")
      .returns<ProjectDivision[]>(),
    supabase.from("projects").select("division_id"),
  ]);

  const counts = new Map<string, number>();
  for (const p of projects ?? []) {
    if (p.division_id) counts.set(p.division_id, (counts.get(p.division_id) ?? 0) + 1);
  }
  const list = divisions ?? [];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-1.5">
        <Link href="/projects" className="text-sm text-muted hover:text-fg">← Projects</Link>
        <h1 className="page-title">Edit divisions</h1>
        <p className="text-sm text-muted">
          Each division is a spoke on the Projects map, in this order clockwise from the top. Every project belongs to
          exactly one.
        </p>
      </div>

      <section className="card space-y-4">
        {list.length === 0 ? (
          <p className="text-sm text-muted">No divisions yet. Add the first one below.</p>
        ) : (
          <ol className="divide-y divide-line">
            {list.map((d, i) => (
              <DivisionRow
                key={d.id}
                division={d}
                projects={counts.get(d.id) ?? 0}
                isFirst={i === 0}
                isLast={i === list.length - 1}
              />
            ))}
          </ol>
        )}
        <p className="text-xs text-muted">
          A division with projects can&apos;t be removed. Move its projects to another division first, from each
          project&apos;s page.
        </p>
      </section>

      <section className="card">
        {list.length >= MAX_DIVISIONS ? (
          <p className="text-sm text-muted">The map has room for {MAX_DIVISIONS} divisions. Remove one to add another.</p>
        ) : (
          <AddDivision />
        )}
      </section>
    </div>
  );
}
