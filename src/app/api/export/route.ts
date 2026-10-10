import Papa from "papaparse";
import { NextResponse } from "next/server";
import { todayNY } from "@/lib/dates";
import { formatPhone } from "@/lib/normalize";
import { createClient } from "@/lib/supabase/server";
import { getTeam } from "@/lib/team";
import { stageLabel, type Lead } from "@/lib/types";

const PAGE = 1000; // Supabase returns at most 1000 rows per request

// GET /api/export: CSV of every lead. Admins only.
export async function GET() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return new NextResponse("Not signed in", { status: 401 });

  const { data: me } = await supabase.from("profiles").select("role, active").eq("id", userId).maybeSingle();
  if (me?.role !== "admin" || !me.active) return new NextResponse("Admins only", { status: 403 });

  const leads: Lead[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .order("created_at")
      .order("id")
      .range(from, from + PAGE - 1)
      .returns<Lead[]>();
    if (error) return new NextResponse("Export failed", { status: 500 });
    leads.push(...data);
    if (data.length < PAGE) break;
  }

  const owners = new Map((await getTeam(supabase)).map((m) => [m.id, m]));
  const toRow = (l: Lead) => ({
    "Business name": l.business_name,
    "Contact name": l.contact_name,
    Phone: formatPhone(l.phone),
    Email: l.email,
    Website: l.website,
    City: l.city,
    State: l.state,
    Niche: l.niche,
    Source: l.source,
    Stage: l.stage ? stageLabel(l.stage) : "",
    Owner: l.owner_id ? owners.get(l.owner_id)?.full_name ?? "" : "",
    "Owner email": l.owner_id ? owners.get(l.owner_id)?.email ?? "" : "",
    "Service interest": l.service_interest,
    "Deal value": l.deal_value,
    "Spec site URL": l.spec_site_url,
    "Next follow-up": l.next_follow_up,
    "Do not contact": l.do_not_contact ? "Yes" : "No",
    "Lost reason": l.lost_reason,
    "Won date": l.won_date,
    "Created at": l.created_at,
    "Updated at": l.updated_at,
    "Lead ID": l.id,
  });

  // escapeFormulae stops cells like "=HYPERLINK(...)" from running in Sheets/Excel.
  const fields = Object.keys(toRow({} as Lead));
  const csv = Papa.unparse({ fields, data: leads.map((l) => Object.values(toRow(l))) }, { escapeFormulae: true });

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leu-leads-${todayNY()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
