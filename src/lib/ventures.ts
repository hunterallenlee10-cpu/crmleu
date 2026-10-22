import { z } from "zod";
import { daysBetween } from "./dates";

// Ventures are the big branches of LEU and the spokes on the Ventures map.
// The database enforces the same limits (see the ventures migration).
export const MAX_VENTURES = 24;
export const MAX_VENTURE_NAME = 40;
export const MAX_VENTURE_DESCRIPTION = 2000;

export const VENTURE_STATUSES = ["idea", "building", "live", "paused"] as const;
export type VentureStatus = (typeof VENTURE_STATUSES)[number];

export const STATUS_LABEL: Record<VentureStatus, string> = {
  idea: "Idea",
  building: "Building",
  live: "Live",
  paused: "Paused",
};

export const STATUS_PILL: Record<VentureStatus, string> = {
  idea: "pill-neutral",
  building: "pill-info",
  live: "pill-success",
  paused: "pill-warning",
};

export function isVentureStatus(v: unknown): v is VentureStatus {
  return typeof v === "string" && (VENTURE_STATUSES as readonly string[]).includes(v);
}

export function parseVentureName(raw: string): { ok: true; name: string } | { ok: false; error: string } {
  const name = raw.replace(/\s+/g, " ").trim();
  if (!name) return { ok: false, error: "Give the venture a name." };
  if (name.length > MAX_VENTURE_NAME) {
    return { ok: false, error: `Keep venture names to ${MAX_VENTURE_NAME} characters or fewer.` };
  }
  return { ok: true, name };
}

const optionalDate = z.union([z.iso.date(), z.literal("")]).transform((v) => v || null);

const VentureSchema = z
  .object({
    name: z.string(),
    description: z
      .string()
      .trim()
      .max(MAX_VENTURE_DESCRIPTION, "Keep the description under 2,000 characters.")
      .transform((v) => v || null),
    lead_id: z.union([z.guid(), z.literal("")]).transform((v) => v || null),
    status: z.enum(VENTURE_STATUSES),
    start_date: optionalDate,
    target_date: optionalDate,
  })
  .refine((v) => !v.start_date || !v.target_date || v.target_date >= v.start_date, {
    message: "The target date can't be before the start date.",
    path: ["target_date"],
  });

export type VentureInput = z.infer<typeof VentureSchema>;

export const VENTURE_FIELDS = ["name", "description", "lead_id", "status", "start_date", "target_date"] as const;

export function parseVentureForm(formData: FormData):
  | { ok: true; data: VentureInput }
  | { ok: false; error: string } {
  const name = parseVentureName(String(formData.get("name") ?? ""));
  if (!name.ok) return name;
  const parsed = VentureSchema.safeParse(
    Object.fromEntries(VENTURE_FIELDS.map((f) => [f, String(formData.get(f) ?? "")])),
  );
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue.path[0];
    if (field === "start_date" || (field === "target_date" && issue.code !== "custom")) {
      return { ok: false, error: "Pick valid dates for the timeline." };
    }
    if (field === "lead_id") return { ok: false, error: "Pick who runs this venture." };
    if (field === "status") return { ok: false, error: "Pick a status." };
    return { ok: false, error: issue.message };
  }
  return { ok: true, data: { ...parsed.data, name: name.name } };
}

// Where today sits on a venture's timeline. `fraction` is how much of the
// time from start to target has passed (null without both dates).
export function timelineInfo(start: string | null, target: string | null, today: string) {
  let fraction: number | null = null;
  if (start && target) {
    const span = daysBetween(start, target);
    const gone = daysBetween(start, today);
    fraction = span > 0 ? Math.min(Math.max(gone / span, 0), 1) : gone >= 0 ? 1 : 0;
  }

  let note: string | null = null;
  let late = false;
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  if (start && start > today) {
    note = `Starts in ${plural(daysBetween(today, start), "day")}`;
  } else if (target) {
    const left = daysBetween(today, target);
    late = left < 0;
    note = left > 0 ? `${plural(left, "day")} left` : left === 0 ? "Target is today" : `${plural(-left, "day")} past target`;
  }
  return { fraction, note, late };
}
