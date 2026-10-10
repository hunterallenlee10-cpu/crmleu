import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import { InviteForm } from "./invite-form";

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { data: team } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, active, commission_rate, created_at")
    .order("full_name")
    .returns<Profile[]>();

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Team</h1>
      <InviteForm />
      <ul className="space-y-3">
        {(team ?? []).map((p) => (
          <li key={p.id} className="card flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-medium">{p.full_name}</p>
              <p className="text-sm text-muted">{p.email}</p>
            </div>
            <div className="flex gap-2 text-xs uppercase tracking-wide">
              <span className={p.role === "admin" ? "text-gold" : "text-muted"}>{p.role}</span>
              {!p.active && <span className="text-danger">inactive</span>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
