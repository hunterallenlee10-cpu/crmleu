import "server-only";
import { z } from "zod";
import type { createClient } from "@/lib/supabase/server";
import { normalizePhone } from "@/lib/normalize";
import { SERVICE_INTERESTS, STAGES, type Lead, type Stage } from "@/lib/types";
import { sendStageChangedWebhook } from "@/lib/webhook";

type Supabase = Awaited<ReturnType<typeof createClient>>;
type DbError = { code?: string; message: string };

// What we tell a rep when a lead already exists. Deliberately says nothing
// about who owns it.
export const DUPLICATE_MESSAGES: Record<string, string> = {
  phone: "Already claimed: a lead with this phone number is already in the CRM.",
  name_city: "Already claimed: this business is already in the CRM for that city.",
};

// Turns Postgres errors from our constraints and triggers into plain English.
export function friendlyDbError(error: DbError): string {
  const msg = error.message ?? "";
  switch (error.code) {
    case "23505":
      if (msg.includes("project_divisions_name")) return "There's already a division with that name.";
      return msg.includes("leads_phone_unique") ? DUPLICATE_MESSAGES.phone : DUPLICATE_MESSAGES.name_city;
    case "22023":
      return "Enter a valid 10-digit US phone number.";
    case "23514":
      if (msg.includes("lost_needs_reason")) return "Moving to Lost needs a reason.";
      if (msg.includes("won_needs_value")) return "A Won deal needs a deal value.";
      if (msg.includes("business_name_present")) return "Business name is required.";
      return "Some of those values aren't allowed.";
    case "23503":
      if (msg.includes("projects_division_id_fkey")) {
        return msg.includes("is not present")
          ? "That division doesn't exist anymore. Pick another one."
          : "This division still has projects. Move them to another division first.";
      }
      return "That's linked to something else, so it can't be changed.";
    case "42501":
      return msg.startsWith("Only an admin") ? msg : "You don't have permission to do that.";
    default:
      console.error("Database error", error);
      return "Something went wrong. Please try again.";
  }
}

// ---------------------------------------------------------------------------
// Lead form
// ---------------------------------------------------------------------------

const optionalText = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .nullable();

const LeadFieldsSchema = z.object({
  business_name: z.string().trim().min(1, "Business name is required."),
  contact_name: optionalText,
  phone: optionalText.refine((v) => v === null || normalizePhone(v) !== null, {
    message: "Enter a valid 10-digit US phone number.",
  }),
  email: optionalText.refine((v) => v === null || z.email().safeParse(v).success, {
    message: "Enter a valid email address.",
  }),
  website: optionalText,
  city: optionalText,
  state: optionalText.transform((v) => v?.toUpperCase() ?? null),
  niche: optionalText,
  service_interest: z
    .enum(SERVICE_INTERESTS.map((s) => s.value) as [string, ...string[]])
    .nullable(),
  deal_value: z.number().min(0, "Deal value can't be negative.").nullable(),
  spec_site_url: optionalText,
  next_follow_up: z.iso.date().nullable(),
  do_not_contact: z.boolean(),
});

export type LeadFields = z.infer<typeof LeadFieldsSchema>;

const LEAD_FORM_FIELDS = [
  "business_name", "contact_name", "phone", "email", "website", "city", "state",
  "niche", "service_interest", "deal_value", "spec_site_url", "next_follow_up",
] as const;

// Everything that was typed, so the form can be refilled after an error.
export function formFields(formData: FormData): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const name of LEAD_FORM_FIELDS) fields[name] = String(formData.get(name) ?? "");
  if (formData.get("do_not_contact") === "on") fields.do_not_contact = "on";
  return fields;
}

export function parseLeadForm(formData: FormData) {
  const get = (name: string) => String(formData.get(name) ?? "");
  const money = get("deal_value").replace(/[$,\s]/g, "");

  const parsed = LeadFieldsSchema.safeParse({
    business_name: get("business_name"),
    contact_name: get("contact_name"),
    phone: get("phone"),
    email: get("email"),
    website: get("website"),
    city: get("city"),
    state: get("state"),
    niche: get("niche"),
    service_interest: get("service_interest") || null,
    deal_value: money === "" ? null : Number(money),
    spec_site_url: get("spec_site_url"),
    next_follow_up: get("next_follow_up") || null,
    do_not_contact: formData.get("do_not_contact") === "on",
  });

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const message = issue.path[0] === "deal_value" && issue.code === "invalid_type"
      ? "Deal value must be a number."
      : issue.message;
    return { ok: false, error: message } as const;
  }

  // The edit form leaves follow-up out (it has its own picker), so don't wipe it.
  const data: Partial<LeadFields> & Omit<LeadFields, "next_follow_up"> = { ...parsed.data };
  if (!formData.has("next_follow_up")) delete data.next_follow_up;
  return { ok: true, data } as const;
}

// Returns a "duplicate" message or null. Runs in the database with
// check_duplicate(), which never reveals whose lead it is.
export async function findDuplicate(
  supabase: Supabase,
  lead: { phone: string | null; business_name: string; city: string | null },
  excludeId?: string,
): Promise<string | null> {
  const { data, error } = await supabase.rpc("check_duplicate", {
    p_phone: lead.phone,
    p_business_name: lead.business_name,
    p_city: lead.city,
    p_exclude_id: excludeId ?? null,
  });
  if (error) return friendlyDbError(error);
  return data ? DUPLICATE_MESSAGES[data as string] : null;
}

// ---------------------------------------------------------------------------
// Stage changes. Every stage change in the app goes through here.
// The database logs the change as an activity and sets/clears the won date;
// then we notify WEBHOOK_URL (if set).
// ---------------------------------------------------------------------------

export type StageChange = {
  stage: Stage;
  lostReason?: string | null;
  dealValue?: number | null;
};

export async function changeLeadStage(
  supabase: Supabase,
  leadId: string,
  change: StageChange,
): Promise<{ error?: string }> {
  if (!STAGES.some((s) => s.value === change.stage)) return { error: "Unknown stage." };

  const lostReason = change.lostReason?.trim() ?? "";
  if (change.stage === "lost" && !lostReason) return { error: "Moving to Lost needs a reason." };
  if (change.stage === "won" && !(change.dealValue != null && change.dealValue > 0)) {
    return { error: "Moving to Won needs a deal value." };
  }

  const { data: current } = await supabase
    .from("leads")
    .select("stage")
    .eq("id", leadId)
    .maybeSingle<{ stage: Stage }>();
  if (!current) return { error: "Lead not found." };
  if (current.stage === change.stage) return {};

  const update: Record<string, unknown> = { stage: change.stage };
  if (change.stage === "lost") update.lost_reason = lostReason;
  if (change.stage === "won") update.deal_value = change.dealValue;

  const { data: lead, error } = await supabase
    .from("leads")
    .update(update)
    .eq("id", leadId)
    .select("*")
    .maybeSingle<Lead>();
  if (error) return { error: friendlyDbError(error) };
  if (!lead) return { error: "Lead not found." };

  const { data: owner } = lead.owner_id
    ? await supabase.from("profiles").select("id, full_name, email").eq("id", lead.owner_id).maybeSingle()
    : { data: null };
  sendStageChangedWebhook({
    event: "stage_changed",
    from_stage: current.stage,
    to_stage: lead.stage,
    changed_at: lead.updated_at,
    lead,
    owner: owner ? { id: owner.id, name: owner.full_name, email: owner.email } : null,
  });

  return {};
}
