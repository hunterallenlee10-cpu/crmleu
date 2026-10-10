"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import {
  parseDate,
  parseMoney,
  parseServiceInterest,
  parseStage,
  parseYes,
  type ImportRow,
} from "@/lib/import-fields";
import { normalizeBusinessName, normalizeCity, normalizePhone } from "@/lib/normalize";
import { createClient } from "@/lib/supabase/server";
import type { ServiceInterest, Stage } from "@/lib/types";

const MAX_ROWS = 5000;
const CHUNK = 500;

export type SkippedRow = { row: number; business_name: string; reason: string };
export type Assignment = { mode: "single"; ownerId: string } | { mode: "round_robin" };
export type ImportReport = { error?: string; ready?: number; imported?: number; skipped: SkippedRow[] };

type PreparedLead = {
  row: number; // line number in the CSV (the header is line 1)
  business_name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  city: string | null;
  state: string | null;
  niche: string | null;
  service_interest: ServiceInterest | null;
  stage: Stage;
  deal_value: number | null;
  spec_site_url: string | null;
  next_follow_up: string | null;
  do_not_contact: boolean;
  lost_reason: string | null;
  won_date: string | null;
  notes: string | null;
};

type Supabase = Awaited<ReturnType<typeof createClient>>;

// Step 1 (preview): what would be imported and what would be skipped, and why.
export async function checkImport(rows: ImportRow[]): Promise<ImportReport> {
  await requireAdmin();
  if (rows.length > MAX_ROWS) return { error: `Import at most ${MAX_ROWS} rows at a time.`, skipped: [] };
  const supabase = await createClient();
  const { ready, skipped } = await prepare(supabase, rows);
  return { ready: ready.length, skipped };
}

// Step 2: actually import. Runs the same checks again first.
export async function runImport(rows: ImportRow[], assignment: Assignment): Promise<ImportReport> {
  const admin = await requireAdmin();
  if (rows.length > MAX_ROWS) return { error: `Import at most ${MAX_ROWS} rows at a time.`, skipped: [] };
  const supabase = await createClient();

  // Who gets the leads
  let owners: string[];
  if (assignment.mode === "single") {
    const { data } = await supabase.from("profiles").select("id, active").eq("id", assignment.ownerId).maybeSingle();
    if (!data?.active) return { error: "Pick an active team member to own these leads.", skipped: [] };
    owners = [data.id];
  } else {
    // Same order the n8n API uses: whoever was assigned a lead longest ago goes first.
    const { data } = await supabase
      .from("profiles")
      .select("id")
      .eq("role", "rep")
      .eq("active", true)
      .order("last_assigned_at", { ascending: true, nullsFirst: true })
      .order("created_at");
    owners = (data ?? []).map((p) => p.id as string);
    if (owners.length === 0) return { error: "There are no active reps to share the leads between.", skipped: [] };
  }

  const { ready, skipped } = await prepare(supabase, rows);
  const toInsert = ready.map((lead, i) => ({ lead, owner_id: owners[i % owners.length] }));

  // Insert in chunks. If a chunk hits a duplicate that appeared since the
  // check (someone added it meanwhile), retry that chunk one row at a time.
  const inserted: { lead: PreparedLead; id: string }[] = [];
  for (let start = 0; start < toInsert.length; start += CHUNK) {
    const chunk = toInsert.slice(start, start + CHUNK);
    const { data, error } = await supabase
      .from("leads")
      .insert(chunk.map(toDbRow))
      .select("id, business_name_norm, city_norm");
    if (!error && data) {
      // Match saved rows back to their source rows (name + city is unique).
      const ids = new Map(data.map((d) => [`${d.business_name_norm}|${d.city_norm}`, d.id as string]));
      chunk.forEach((c) => inserted.push({ lead: c.lead, id: ids.get(nameCityKey(c.lead))! }));
      continue;
    }
    for (const c of chunk) {
      const { data: one, error: oneError } = await supabase.from("leads").insert(toDbRow(c)).select("id").single();
      if (one) inserted.push({ lead: c.lead, id: one.id as string });
      else skipped.push({ row: c.lead.row, business_name: c.lead.business_name, reason: oneError?.code === "23505" ? "Already in the CRM" : "Couldn't be saved" });
    }
  }

  // Notes from the sheet become a note in each lead's history.
  const notes = inserted
    .filter((x) => x.id && x.lead.notes)
    .map((x) => ({ lead_id: x.id, user_id: admin.id, type: "note", body: x.lead.notes }));
  for (let start = 0; start < notes.length; start += CHUNK) {
    await supabase.from("activities").insert(notes.slice(start, start + CHUNK));
  }

  // Keep round robin fair for the next API lead: the rep who got the last
  // imported lead goes to the back of the line.
  // Lead i went to owners[i % n], so the next one belongs to owners[count % n].
  if (assignment.mode === "round_robin" && toInsert.length > 0) {
    const now = Date.now();
    for (let k = 0; k < owners.length; k++) {
      await supabase
        .from("profiles")
        .update({ last_assigned_at: new Date(now + k).toISOString() })
        .eq("id", owners[(toInsert.length + k) % owners.length]);
    }
  }

  revalidatePath("/", "layout");
  skipped.sort((a, b) => a.row - b.row);
  return { imported: inserted.length, skipped };
}

function nameCityKey(lead: { business_name: string; city: string | null }) {
  return `${normalizeBusinessName(lead.business_name)}|${normalizeCity(lead.city)}`;
}

function toDbRow({ lead, owner_id }: { lead: PreparedLead; owner_id: string }) {
  const fields: Partial<PreparedLead> = { ...lead };
  delete fields.row; // not columns on leads
  delete fields.notes;
  return { ...fields, owner_id, source: "import" as const };
}

// Validate and normalize every row, then drop duplicates: first within the
// file, then against leads already in the CRM.
async function prepare(supabase: Supabase, rows: ImportRow[]) {
  const skipped: SkippedRow[] = [];
  const candidates: PreparedLead[] = [];
  const seenPhone = new Map<string, number>();
  const seenNameCity = new Map<string, number>();

  rows.forEach((raw, i) => {
    const row = i + 2;
    const text = (k: keyof ImportRow) => (raw[k] ?? "").trim() || null;
    const business_name = text("business_name") ?? "";
    const skip = (reason: string) => skipped.push({ row, business_name: business_name || "(blank)", reason });

    if (!normalizeBusinessName(business_name)) return skip("Missing business name");

    let phone: string | null = null;
    if (text("phone")) {
      phone = normalizePhone(text("phone"));
      if (!phone) return skip(`Invalid phone number "${text("phone")}"`);
    }

    const stage = parseStage(raw.stage) ?? "new";
    const deal_value = parseMoney(raw.deal_value);
    if (stage === "won" && !deal_value) return skip("Marked Won but has no deal value");

    const email = text("email");
    const lead: PreparedLead = {
      row,
      business_name,
      contact_name: text("contact_name"),
      phone,
      email: email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null,
      website: text("website"),
      city: text("city"),
      state: text("state")?.toUpperCase() ?? null,
      niche: text("niche"),
      service_interest: parseServiceInterest(raw.service_interest),
      stage,
      deal_value,
      spec_site_url: text("spec_site_url"),
      next_follow_up: parseDate(raw.next_follow_up),
      do_not_contact: parseYes(raw.do_not_contact),
      lost_reason: stage === "lost" ? text("lost_reason") ?? "Imported as Lost" : null,
      won_date: stage === "won" ? parseDate(raw.won_date) : null,
      notes: text("notes"),
    };

    const nameCity = nameCityKey(lead);
    const dupRow = (phone && seenPhone.get(phone)) || seenNameCity.get(nameCity);
    if (dupRow) return skip(`Duplicate of row ${dupRow} in this file`);
    if (phone) seenPhone.set(phone, row);
    seenNameCity.set(nameCity, row);
    candidates.push(lead);
  });

  // One database call checks every remaining row against existing leads.
  const existing = new Map<number, string>();
  for (let start = 0; start < candidates.length; start += CHUNK) {
    const chunk = candidates.slice(start, start + CHUNK);
    const { data, error } = await supabase.rpc("check_duplicates_bulk", {
      p_phones: chunk.map((c) => c.phone),
      p_business_names: chunk.map((c) => c.business_name),
      p_cities: chunk.map((c) => c.city),
    });
    if (error) throw new Error(error.message);
    for (const d of (data ?? []) as { idx: number; reason: string }[]) existing.set(start + d.idx, d.reason);
  }

  const ready: PreparedLead[] = [];
  candidates.forEach((c, i) => {
    const reason = existing.get(i);
    if (!reason) return ready.push(c);
    skipped.push({
      row: c.row,
      business_name: c.business_name,
      reason: reason === "phone" ? "Already in the CRM (same phone)" : "Already in the CRM (same business name and city)",
    });
  });

  skipped.sort((a, b) => a.row - b.row);
  return { ready, skipped };
}
