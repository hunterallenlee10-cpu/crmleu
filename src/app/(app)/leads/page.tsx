import type { Metadata } from "next";
import Link from "next/link";
import { LeadRow } from "@/components/lead-row";
import { getProfile } from "@/lib/auth";
import { todayNY } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { STAGES, type Lead } from "@/lib/types";
import { LeadFilters } from "./filters";

export const metadata: Metadata = { title: "My leads" };

const LIMIT = 500;

export default async function LeadsPage({ searchParams }: PageProps<"/leads">) {
  const profile = await getProfile();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const stage = typeof sp.stage === "string" && STAGES.some((s) => s.value === sp.stage) ? sp.stage : "";
  const niche = typeof sp.niche === "string" ? sp.niche : "";

  const supabase = await createClient();
  let query = supabase
    .from("leads")
    .select("*")
    .eq("owner_id", profile.id)
    .order("next_follow_up", { ascending: true, nullsFirst: false })
    .order("business_name")
    .limit(LIMIT);

  if (stage) query = query.eq("stage", stage);
  if (niche) query = query.eq("niche", niche);
  const search = searchFilter(q);
  if (search) query = query.or(search);

  const [{ data: leads }, { data: nicheRows }] = await Promise.all([
    query.returns<Lead[]>(),
    supabase.from("leads").select("niche").eq("owner_id", profile.id).not("niche", "is", null),
  ]);

  const niches = [...new Set((nicheRows ?? []).map((r) => r.niche as string))].sort();
  const today = todayNY();
  const list = leads ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">My leads</h1>
        <Link href="/leads/new" className="btn btn-gold">+ New lead</Link>
      </div>
      <LeadFilters niches={niches} />
      <p className="text-sm text-muted">
        {list.length === LIMIT ? `Showing the first ${LIMIT}. Narrow your search.` : `${list.length} lead${list.length === 1 ? "" : "s"}`}
      </p>
      <div className="space-y-3">
        {list.map((lead) => (
          <LeadRow key={lead.id} lead={lead} today={today} />
        ))}
      </div>
    </div>
  );
}

// Builds a PostgREST "or" filter for the search box. Characters that have
// meaning in that syntax are stripped out.
function searchFilter(raw: string): string | null {
  const q = raw.replace(/[,()*%\\:"]/g, " ").trim();
  if (!q) return null;
  const parts = [
    `business_name.ilike.*${q}*`,
    `contact_name.ilike.*${q}*`,
    `city.ilike.*${q}*`,
    `email.ilike.*${q}*`,
  ];
  const digits = q.replace(/\D/g, "");
  if (digits.length >= 3) parts.push(`phone.like.*${digits}*`);
  return parts.join(",");
}
