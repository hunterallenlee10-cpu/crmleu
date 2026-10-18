import type { Metadata } from "next";
import { LeadForm } from "@/components/lead-form";
import { getProfile } from "@/lib/auth";
import { getNiches } from "@/lib/niches";
import { createClient } from "@/lib/supabase/server";
import { createLead } from "../actions";

export const metadata: Metadata = { title: "New lead" };

export default async function NewLeadPage() {
  await getProfile();
  const supabase = await createClient();
  const niches = await getNiches(supabase);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="page-title">New lead</h1>
      <p className="-mt-3 text-muted">
        We check the phone number and business name + city so two reps never work the same business.
      </p>
      <div className="card">
        <LeadForm action={createLead} niches={niches} submitLabel="Save lead" />
      </div>
    </div>
  );
}
