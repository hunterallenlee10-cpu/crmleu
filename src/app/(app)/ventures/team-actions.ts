"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getProfile, requireAdmin } from "@/lib/auth";
import { parseTitle } from "@/lib/hierarchy";
import { friendlyDbError } from "@/lib/leads";
import { parseNewPromotion, sameTitle, type Seat } from "@/lib/promotions";
import { createClient } from "@/lib/supabase/server";

// Admins run the Team chart's "Promotions up for grabs": add and remove
// title promotions, and hand them out (a job title, or a venture's lead seat,
// which is what the Ventures map shows). RLS enforces the same rules in the
// database.

type Result = { error?: string };

const SeatSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("title"), title: z.string() }),
  z.object({ kind: z.literal("lead"), ventureId: z.guid() }),
]);

const NEEDS_MIGRATION = "The database needs updating first. Run `npx supabase db push`, then try again.";
const missingSchema = (code?: string) => code === "42703" || code === "42P01" || code === "PGRST204" || code === "PGRST205";

async function check(personId: string, rawSeat: Seat) {
  await requireAdmin();
  const seat = SeatSchema.safeParse(rawSeat);
  if (!z.guid().safeParse(personId).success || !seat.success) return { error: "That promotion can't be given out." } as const;
  const supabase = await createClient();
  return { supabase, seat: seat.data } as const;
}

function done(): Result {
  revalidatePath("/", "layout");
  return {};
}

export async function giveSeat(personId: string, rawSeat: Seat): Promise<Result> {
  const c = await check(personId, rawSeat);
  if ("error" in c) return { error: c.error };
  const { supabase, seat } = c;

  const { data: person } = await supabase.from("profiles").select("active").eq("id", personId).maybeSingle();
  if (!person?.active) return { error: "That person isn't an active team member." };

  if (seat.kind === "title") {
    const title = parseTitle(seat.title);
    if (!title.ok) return { error: title.error };
    const { error } = await supabase.from("profiles").update({ title: title.title }).eq("id", personId);
    if (error) return { error: missingSchema(error.code) ? NEEDS_MIGRATION : friendlyDbError(error) };
    return done();
  }

  const { data: venture } = await supabase.from("ventures").select("name, lead_id").eq("id", seat.ventureId).maybeSingle();
  if (!venture) return { error: "That venture doesn't exist anymore." };
  if (venture.lead_id === personId) return done();
  // Only fill an empty seat, so a stale page can't replace someone.
  const { data, error } = await supabase
    .from("ventures")
    .update({ lead_id: personId })
    .eq("id", seat.ventureId)
    .is("lead_id", null)
    .select("id");
  if (error) return { error: friendlyDbError(error) };
  if (!data.length) return { error: `${venture.name} already has a lead.` };
  return done();
}

// Takes a promotion back. Does nothing if they don't hold it anymore.
export async function takeSeat(personId: string, rawSeat: Seat): Promise<Result> {
  const c = await check(personId, rawSeat);
  if ("error" in c) return { error: c.error };
  const { supabase, seat } = c;

  if (seat.kind === "title") {
    const { data: current } = await supabase.from("profiles").select("*").eq("id", personId).maybeSingle();
    if (!sameTitle((current as { title?: string | null } | null)?.title, seat.title)) return done();
    const { error } = await supabase.from("profiles").update({ title: null }).eq("id", personId);
    if (error) return { error: missingSchema(error.code) ? NEEDS_MIGRATION : friendlyDbError(error) };
    return done();
  }

  const { error } = await supabase
    .from("ventures")
    .update({ lead_id: null })
    .eq("id", seat.ventureId)
    .eq("lead_id", personId);
  if (error) return { error: friendlyDbError(error) };
  return done();
}

// Puts a typed-in promotion on the board. It can't repeat one that's already
// there or a venture's lead seat.
export async function addPromotion(raw: string): Promise<Result> {
  await requireAdmin();
  const supabase = await createClient();
  const [{ data: titles, error: readError }, { data: ventures }] = await Promise.all([
    supabase.from("promotions").select("id, title"),
    supabase.from("ventures").select("id, name, lead_id"),
  ]);
  if (readError) return { error: missingSchema(readError.code) ? NEEDS_MIGRATION : friendlyDbError(readError) };

  const parsed = parseNewPromotion(raw, {
    titles: titles ?? [],
    ventures: (ventures ?? []).map((v) => ({ id: v.id, name: v.name, leadId: v.lead_id })),
  });
  if (!parsed.ok) return { error: parsed.error };

  const me = await getProfile();
  const { error } = await supabase.from("promotions").insert({ title: parsed.title, created_by: me.id });
  if (error) {
    if (error.code === "23505") return { error: `${parsed.title} is already a promotion.` };
    return { error: missingSchema(error.code) ? NEEDS_MIGRATION : friendlyDbError(error) };
  }
  return done();
}

// Takes a promotion off the board. Anyone who already has that title keeps it.
export async function removePromotion(id: string): Promise<Result> {
  await requireAdmin();
  if (!z.guid().safeParse(id).success) return { error: "That promotion isn't on the board." };
  const supabase = await createClient();
  const { error } = await supabase.from("promotions").delete().eq("id", id);
  if (error) return { error: missingSchema(error.code) ? NEEDS_MIGRATION : friendlyDbError(error) };
  return done();
}
