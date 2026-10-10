import type { Metadata } from "next";
import { LeadForm } from "@/components/lead-form";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createLead } from "../actions";

export const metadata: Metadata = { title: "New lead" };

export default async function NewLeadPage() {
  await getProfile();
  const supabase = await createClient();
  const { data } = await supabase.from("leads").select("niche").not("niche", "is", null);
  const niches = [...new Set((data ?? []).map((r) => r.niche as string))].sort();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">New lead</h1>
      <p className="text-sm text-muted">
        We check the phone number and business name + city so two reps never work the same business.
      </p>
      <div className="card">
        <LeadForm action={createLead} niches={niches} submitLabel="Save lead" />
      </div>
    </div>
  );
}
