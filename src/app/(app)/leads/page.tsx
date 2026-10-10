import type { Metadata } from "next";
import Link from "next/link";
import { LeadRow } from "@/components/lead-row";
import { getProfile } from "@/lib/auth";
import { todayNY } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { getNiches } from "@/lib/niches";
import { getTeam } from "@/lib/team";
import { STAGES, type Lead } from "@/lib/types";
import { BulkLeadList } from "./bulk-list";
import { LeadFilters } from "./filters";

export const metadata: Metadata = { title: "Leads" };

const PAGE_SIZE = 50;

// Reps see their own leads. Admins see every lead, can filter by owner,
// and can bulk-reassign.
export default async function LeadsPage({ searchParams }: PageProps<"/leads">) {
  const profile = await getProfile();
  const isAdmin = profile.role === "admin";
  const sp = await searchParams;
  const param = (name: string) => (typeof sp[name] === "string" ? (sp[name] as string) : "");

  const q = param("q");
  const stage = STAGES.some((s) => s.value === param("stage")) ? param("stage") : "";
  const niche = param("niche");
  const owner = isAdmin ? param("owner") : "";
  const page = Math.max(1, Number(param("page")) || 1);

  const supabase = await createClient();
  let query = supabase
    .from("leads")
    .select("*", { count: "exact" })
    .order("next_follow_up", { ascending: true, nullsFirst: false })
    .order("business_name")
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (!isAdmin) query = query.eq("owner_id", profile.id);
  if (owner === "unassigned") query = query.is("owner_id", null);
  else if (/^[0-9a-f-]{36}$/.test(owner)) query = query.eq("owner_id", owner);
  if (stage) query = query.eq("stage", stage);
  if (niche) query = query.eq("niche", niche);
  const search = searchFilter(q);
  if (search) query = query.or(search);

  const [{ data: leads, count }, niches, team] = await Promise.all([
    query.returns<Lead[]>(),
    getNiches(supabase),
    isAdmin ? getTeam(supabase) : Promise.resolve([]),
  ]);

  const today = todayNY();
  const list = leads ?? [];
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const ownerFilter = [
    { value: "unassigned", label: "Unassigned" },
    ...team.map((m) => ({ value: m.id, label: m.active ? m.full_name : `${m.full_name} (inactive)` })),
  ];
  const assignees = team.filter((m) => m.active).map((m) => ({ value: m.id, label: m.full_name }));
  const ownerNames = Object.fromEntries(team.map((m) => [m.id, m.full_name]));

  const pageHref = (n: number) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries({ q, stage, niche, owner })) if (v) next.set(k, v);
    if (n > 1) next.set("page", String(n));
    const qs = next.toString();
    return qs ? `/leads?${qs}` : "/leads";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{isAdmin ? "All leads" : "My leads"}</h1>
        <Link href="/leads/new" className="btn btn-gold">+ New lead</Link>
      </div>
      <LeadFilters niches={niches} owners={isAdmin ? ownerFilter : undefined} />
      <p className="text-sm text-muted">
        {total} lead{total === 1 ? "" : "s"}
        {pages > 1 && ` · page ${page} of ${pages}`}
      </p>

      {isAdmin ? (
        <BulkLeadList leads={list} today={today} ownerNames={ownerNames} assignees={assignees} />
      ) : (
        <div className="space-y-3">
          {list.map((lead) => (
            <LeadRow key={lead.id} lead={lead} today={today} />
          ))}
        </div>
      )}

      {pages > 1 && (
        <nav className="flex items-center justify-between gap-3" aria-label="Pages">
          {page > 1 ? <Link href={pageHref(page - 1)} className="btn btn-ghost">← Previous</Link> : <span />}
          {page < pages ? <Link href={pageHref(page + 1)} className="btn btn-ghost">Next →</Link> : <span />}
        </nav>
      )}
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
