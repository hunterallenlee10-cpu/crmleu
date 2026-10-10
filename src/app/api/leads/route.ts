import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { DUPLICATE_MESSAGES } from "@/lib/leads";
import { normalizePhone } from "@/lib/normalize";
import { createAdminClient } from "@/lib/supabase/admin";
import { SERVICE_INTERESTS } from "@/lib/types";

// POST /api/leads: create a lead from n8n (or any automation).
//
//   Header:  x-api-key: <LEADS_API_KEY>
//   Body:    { "business_name": "Joe's Pizza", "phone": "301-555-0100", ... }
//   201 { "result": "created", "id": "...", "owner": { id, name, email } | null }
//   409 { "result": "duplicate", "reason": "phone" | "name_city" }
//   400 { "result": "error", "error": "..." }   401 bad key   503 API not configured
//
// Runs with the service-role key (there is no logged-in user), so it does its
// own checks. New leads go round robin to active reps.

const text = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).trim() || null)
  .nullish();

const ApiLead = z.object({
  business_name: z.string().trim().min(1, "business_name is required"),
  contact_name: text,
  phone: text.refine((v) => !v || normalizePhone(v) !== null, "phone must be a 10-digit US number"),
  email: text.refine((v) => !v || z.email().safeParse(v).success, "email is not valid"),
  website: text,
  city: text,
  state: text,
  niche: text,
  service_interest: z.enum(SERVICE_INTERESTS.map((s) => s.value) as [string, ...string[]]).nullish(),
  spec_site_url: text,
  next_follow_up: z.iso.date().nullish(),
  notes: text, // saved as a note in the lead's history
});

function validKey(given: string | null, expected: string) {
  // Compare hashes so the check takes the same time whatever was sent.
  const a = createHash("sha256").update(given ?? "").digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

const json = (body: object, status: number) => NextResponse.json(body, { status });

export async function POST(request: NextRequest) {
  const expected = process.env.LEADS_API_KEY;
  if (!expected) return json({ result: "error", error: "LEADS_API_KEY is not set on the server" }, 503);
  if (!validKey(request.headers.get("x-api-key"), expected)) {
    return json({ result: "error", error: "Invalid or missing x-api-key header" }, 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ result: "error", error: "Body must be JSON" }, 400);
  }
  const parsed = ApiLead.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return json({ result: "error", error: issue.path.length ? `${issue.path.join(".")}: ${issue.message}` : issue.message }, 400);
  }
  const { notes, ...fields } = parsed.data;
  const lead = { ...fields, phone: fields.phone ? normalizePhone(fields.phone) : null, state: fields.state?.toUpperCase() ?? null };

  const supabase = createAdminClient();

  // Every parameter must be present (null, not missing) for Supabase to find the function.
  const { data: duplicate, error: dupError } = await supabase.rpc("check_duplicate", {
    p_phone: lead.phone ?? null,
    p_business_name: lead.business_name,
    p_city: lead.city ?? null,
    p_exclude_id: null,
  });
  if (dupError) return serverError(dupError);
  if (duplicate) return json({ result: "duplicate", reason: duplicate, message: DUPLICATE_MESSAGES[duplicate] }, 409);

  // Next rep in the rotation (null if there are no active reps: the lead
  // stays unassigned and shows up for the admin).
  const { data: ownerId, error: rrError } = await supabase.rpc("next_round_robin_rep");
  if (rrError) return serverError(rrError);

  const { data: created, error } = await supabase
    .from("leads")
    .insert({ ...lead, owner_id: ownerId, source: "api" })
    .select("id")
    .single();
  if (error?.code === "23505") {
    return json({ result: "duplicate", reason: error.message.includes("phone") ? "phone" : "name_city" }, 409);
  }
  if (error) return serverError(error);

  await supabase.from("activities").insert({
    lead_id: created.id,
    user_id: null,
    type: "note",
    body: notes ? `Created via API.\n${notes}` : "Created via API.",
  });

  const { data: owner } = ownerId
    ? await supabase.from("profiles").select("id, full_name, email").eq("id", ownerId).single()
    : { data: null };

  return json(
    {
      result: "created",
      id: created.id,
      owner: owner ? { id: owner.id, name: owner.full_name, email: owner.email } : null,
    },
    201,
  );
}

function serverError(error: { message: string }) {
  console.error("POST /api/leads failed", error);
  return json({ result: "error", error: "Server error" }, 500);
}
