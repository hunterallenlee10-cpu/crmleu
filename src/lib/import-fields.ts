// CSV import: the fields you can map columns to, and helpers that turn
// spreadsheet text into lead values. Used by the browser (mapping screen)
// and the server (validation), so no server-only imports here.

import { STAGES, type ServiceInterest, type Stage } from "@/lib/types";

export type ImportFieldKey =
  | "business_name" | "contact_name" | "phone" | "email" | "website" | "city" | "state"
  | "niche" | "service_interest" | "stage" | "deal_value" | "spec_site_url"
  | "next_follow_up" | "do_not_contact" | "lost_reason" | "won_date" | "notes";

export type ImportRow = Partial<Record<ImportFieldKey, string>>;

export const IMPORT_FIELDS: { key: ImportFieldKey; label: string; aliases: string[] }[] = [
  { key: "business_name", label: "Business name (required)", aliases: ["business", "business name", "company", "company name", "account", "lead"] },
  { key: "contact_name", label: "Contact name", aliases: ["contact", "contact name", "owner", "owner name", "name", "decision maker"] },
  { key: "phone", label: "Phone", aliases: ["phone", "phone number", "mobile", "cell", "number", "tel", "telephone"] },
  { key: "email", label: "Email", aliases: ["email", "e-mail", "email address"] },
  { key: "website", label: "Website", aliases: ["website", "site", "url", "web", "domain"] },
  { key: "city", label: "City", aliases: ["city", "town"] },
  { key: "state", label: "State", aliases: ["state", "st"] },
  { key: "niche", label: "Niche", aliases: ["niche", "industry", "category", "type", "vertical"] },
  { key: "service_interest", label: "Service interest", aliases: ["service", "service interest", "interest", "interested in"] },
  { key: "stage", label: "Stage", aliases: ["stage", "status", "pipeline stage", "lead status"] },
  { key: "deal_value", label: "Deal value", aliases: ["deal value", "value", "amount", "price", "deal"] },
  { key: "spec_site_url", label: "Spec site URL", aliases: ["spec site", "spec", "spec url", "spec site url", "demo", "demo site"] },
  { key: "next_follow_up", label: "Next follow-up date", aliases: ["follow up", "next follow up", "follow up date", "next contact", "next step date", "followup"] },
  { key: "do_not_contact", label: "Do not contact (yes/no)", aliases: ["dnc", "do not contact", "do not call"] },
  { key: "lost_reason", label: "Lost reason", aliases: ["lost reason", "reason lost", "reason"] },
  { key: "won_date", label: "Won date", aliases: ["won date", "date won", "closed date", "close date"] },
  { key: "notes", label: "Notes (added to history)", aliases: ["notes", "note", "comments", "comment"] },
];

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

// Guess which CSV column feeds each field by its header. Each column is used once.
export function guessMapping(headers: string[]): Partial<Record<ImportFieldKey, string>> {
  const mapping: Partial<Record<ImportFieldKey, string>> = {};
  const used = new Set<string>();
  for (const field of IMPORT_FIELDS) {
    const wanted = new Set([field.key, ...field.aliases].map(squash));
    const header = headers.find((h) => !used.has(h) && wanted.has(squash(h)));
    if (header) {
      mapping[field.key] = header;
      used.add(header);
    }
  }
  return mapping;
}

const STAGE_SYNONYMS: Record<string, Stage> = {
  closedwon: "won", closed: "won", sold: "won",
  closedlost: "lost", dead: "lost", notinterested: "lost",
  booked: "call_booked", meeting: "call_booked", contacted: "contacted", reachedout: "contacted",
  warmup: "warm_up_program", warmups: "warm_up_program", nurture: "warm_up_program",
  quote: "quote_given", quoted: "quote_given", quotesent: "quote_given",
  // Old stage names, so older spreadsheets still import.
  spec: "warm_up_program", specsent: "warm_up_program",
  proposal: "quote_given", proposalsent: "quote_given",
};

// "Warm Up Program", "warm_up_program", "Closed Won" -> a stage. Blank or unknown -> null.
export function parseStage(raw: string | undefined): Stage | null {
  const s = squash(raw ?? "");
  if (!s) return null;
  const direct = STAGES.find((st) => squash(st.value) === s || squash(st.label) === s);
  return direct?.value ?? STAGE_SYNONYMS[s] ?? null;
}

export function parseServiceInterest(raw: string | undefined): ServiceInterest | null {
  const s = squash(raw ?? "");
  if (!s) return null;
  const parts = [
    s.includes("web") || s.includes("site"),
    s.includes("automat"),
    s.includes("call") || s.includes("answer") || s.includes("receptionist") || s.startsWith("ai"),
  ];
  if (s.includes("multiple") || s === "all" || s === "both" || parts.filter(Boolean).length > 1) return "multiple";
  if (parts[0]) return "website";
  if (parts[1]) return "automation";
  if (parts[2]) return "ai_call_answering";
  return null;
}

// "$2,500.00" -> 2500. Blank or not a number -> null.
export function parseMoney(raw: string | undefined): number | null {
  const s = (raw ?? "").replace(/[$,\s]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

// "2026-10-14", "10/14/2026", "10/14/26" -> "2026-10-14". Anything else -> null.
export function parseDate(raw: string | undefined): string | null {
  const s = (raw ?? "").trim();
  let y: number, m: number, d: number;
  let match = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (match) {
    [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else if ((match = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/))) {
    [m, d, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
    if (y < 100) y += 2000;
  } else {
    return null;
  }
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date.toISOString().slice(0, 10);
}

export function parseYes(raw: string | undefined): boolean {
  return ["yes", "y", "true", "1", "x", "dnc", "donotcontact"].includes(squash(raw ?? ""));
}
