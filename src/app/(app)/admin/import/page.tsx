import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getTeam } from "@/lib/team";
import { ImportWizard } from "./import-wizard";

export const metadata: Metadata = { title: "Import" };

export default async function ImportPage() {
  const supabase = await createClient();
  const members = (await getTeam(supabase))
    .filter((m) => m.active)
    .map((m) => ({ id: m.id, name: m.full_name }));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold">Import leads</h1>
      <ImportWizard members={members} />
    </div>
  );
}
