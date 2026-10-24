"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { parseTitle } from "@/lib/hierarchy";
import { friendlyDbError } from "@/lib/leads";
import { MAX_CO_LEADS, sameTitle, type Seat } from "@/lib/promotions";
import { createClient } from "@/lib/supabase/server";

// Admins hand out promotions on the Team chart: a job title (President,
// CFO...), a venture's lead seat or one of its co-lead seats. Lead and
// co-lead seats are what the Ventures map shows. RLS and the venture_co_leads
// triggers enforce the same rules in the database.

type Result = { error?: string };

const SeatSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("title"), title: z.string() }),
  z.object({ kind: z.literal("lead"), ventureId: z.guid() }),
  z.object({ kind: z.literal("co_lead"), ventureId: z.guid() }),
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

async function ventureName(supabase: Awaited<ReturnType<typeof createClient>>, id: string) {
  const { data } = await supabase.from("ventures").select("name, lead_id").eq("id", id).maybeSingle();
  return data as { name: string; lead_id: string | null } | null;
}

function done(): Result {
  revalidatePath("/", "layout");
  return {};
}

export async function giveSeat(personId: string, rawSeat: Seat): Promise<Result> {
  const c = await check(personId, rawSeat);
  if ("error" in c) return { error: c.error };
  const { supabase, seat } = c;

  const { data: person } = await supabase.from("profiles").select("active, full_name").eq("id", personId).maybeSingle();
  if (!person?.active) return { error: "That person isn't an active team member." };
  const name = (person.full_name as string) || "That person";

  if (seat.kind === "title") {
    const title = parseTitle(seat.title);
    if (!title.ok) return { error: title.error };
    const { error } = await supabase.from("profiles").update({ title: title.title }).eq("id", personId);
    if (error) return { error: missingSchema(error.code) ? NEEDS_MIGRATION : friendlyDbError(error) };
    return done();
  }

  const venture = await ventureName(supabase, seat.ventureId);
  if (!venture) return { error: "That venture doesn't exist anymore." };

  if (seat.kind === "lead") {
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

  if (venture.lead_id === personId) return { error: `${name} already leads ${venture.name}.` };
  const { error } = await supabase.from("venture_co_leads").insert({ venture_id: seat.ventureId, user_id: personId });
  if (error) {
    if (missingSchema(error.code)) return { error: NEEDS_MIGRATION };
    if (error.code === "23505") return { error: `${name} is already a co-lead on ${venture.name}.` };
    if (error.code === "23514") {
      return {
        error: error.message.includes("already lead")
          ? `${name} already leads ${venture.name}.`
          : `${venture.name} already has ${MAX_CO_LEADS} co-leads.`,
      };
    }
    return { error: friendlyDbError(error) };
  }
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

  const { error } =
    seat.kind === "lead"
      ? await supabase.from("ventures").update({ lead_id: null }).eq("id", seat.ventureId).eq("lead_id", personId)
      : await supabase.from("venture_co_leads").delete().eq("venture_id", seat.ventureId).eq("user_id", personId);
  if (error) return { error: missingSchema(error.code) ? NEEDS_MIGRATION : friendlyDbError(error) };
  return done();
}
