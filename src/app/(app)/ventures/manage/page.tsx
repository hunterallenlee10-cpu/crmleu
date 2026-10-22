import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { MAX_VENTURES } from "@/lib/ventures";
import { createClient } from "@/lib/supabase/server";
import { AddVenture, VentureRow } from "./venture-row";

export const metadata: Metadata = { title: "Edit ventures" };

export default async function ManageVenturesPage() {
  await requireAdmin();
  const supabase = await createClient();
  const [{ data: ventures }, { data: tasks }] = await Promise.all([
    supabase.from("ventures").select("id, name").order("position").order("created_at"),
    supabase.from("tasks").select("venture_id").not("venture_id", "is", null),
  ]);

  const counts = new Map<string, number>();
  for (const t of tasks ?? []) {
    if (t.venture_id) counts.set(t.venture_id, (counts.get(t.venture_id) ?? 0) + 1);
  }
  const list = ventures ?? [];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-1.5">
        <Link href="/ventures" className="text-sm text-muted hover:text-fg">← Ventures</Link>
        <h1 className="page-title">Edit ventures</h1>
        <p className="text-sm text-muted">
          Each venture is a branch on the Ventures map, in this order clockwise from the top. Fill in what each one is,
          who runs it and its timeline from the map.
        </p>
      </div>

      <section className="card space-y-4">
        {list.length === 0 ? (
          <p className="text-sm text-muted">No ventures yet. Add the first one below.</p>
        ) : (
          <ol className="divide-y divide-line">
            {list.map((v, i) => (
              <VentureRow
                key={v.id}
                venture={v}
                tasks={counts.get(v.id) ?? 0}
                isFirst={i === 0}
                isLast={i === list.length - 1}
              />
            ))}
          </ol>
        )}
        <p className="text-xs text-muted">
          Removing a venture keeps its tasks. They stay on the Tasks page without a venture.
        </p>
      </section>

      <section className="card">
        {list.length >= MAX_VENTURES ? (
          <p className="text-sm text-muted">The map has room for {MAX_VENTURES} ventures. Remove one to add another.</p>
        ) : (
          <AddVenture />
        )}
      </section>
    </div>
  );
}
