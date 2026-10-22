"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { friendlyDbError } from "@/lib/leads";
import { MAX_VENTURES, parseVentureName } from "@/lib/ventures";
import { createClient } from "@/lib/supabase/server";

// Admins add, rename, reorder and remove ventures (the spokes on the
// Ventures map). RLS enforces the same rules in the database.

type Result = { error?: string };
const VentureId = z.guid();

function done(): Result {
  revalidatePath("/", "layout");
  return {};
}

export async function addVenture(rawName: string): Promise<Result> {
  await requireAdmin();
  const parsed = parseVentureName(rawName);
  if (!parsed.ok) return { error: parsed.error };

  const supabase = await createClient();
  const { data: existing, error: readError } = await supabase
    .from("ventures")
    .select("position")
    .order("position", { ascending: false });
  if (readError) return { error: friendlyDbError(readError) };
  if ((existing?.length ?? 0) >= MAX_VENTURES) {
    return { error: `The map has room for ${MAX_VENTURES} ventures. Remove one first.` };
  }

  const position = existing?.length ? existing[0].position + 1 : 0;
  const { error } = await supabase.from("ventures").insert({ name: parsed.name, position });
  if (error) return { error: friendlyDbError(error) };
  return done();
}

export async function renameVenture(id: string, rawName: string): Promise<Result> {
  await requireAdmin();
  if (!VentureId.safeParse(id).success) return { error: "Venture not found." };
  const parsed = parseVentureName(rawName);
  if (!parsed.ok) return { error: parsed.error };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ventures")
    .update({ name: parsed.name })
    .eq("id", id)
    .select("id");
  if (error) return { error: friendlyDbError(error) };
  if (!data.length) return { error: "Venture not found." };
  return done();
}

// Swap places with the neighbour above or below, which turns the spoke on the map.
export async function moveVenture(id: string, direction: "up" | "down"): Promise<Result> {
  await requireAdmin();
  if (!VentureId.safeParse(id).success) return { error: "Venture not found." };

  const supabase = await createClient();
  const { data: all, error: readError } = await supabase
    .from("ventures")
    .select("id, position")
    .order("position")
    .order("created_at");
  if (readError) return { error: friendlyDbError(readError) };

  const list = all ?? [];
  const from = list.findIndex((d) => d.id === id);
  if (from === -1) return { error: "Venture not found." };
  const to = direction === "up" ? from - 1 : from + 1;
  if (to < 0 || to >= list.length) return {};

  // Write a clean 0..n order so ties from older data can't stall a move.
  const order = list.map((d) => d.id);
  [order[from], order[to]] = [order[to], order[from]];
  const changed = order
    .map((ventureId, position) => ({ id: ventureId, position }))
    .filter((d) => list.find((x) => x.id === d.id)!.position !== d.position);

  for (const d of changed) {
    const { error } = await supabase.from("ventures").update({ position: d.position }).eq("id", d.id);
    if (error) return { error: friendlyDbError(error) };
  }
  return done();
}

// Its tasks stay on the task list, just without a venture.
export async function removeVenture(id: string): Promise<Result> {
  await requireAdmin();
  if (!VentureId.safeParse(id).success) return { error: "Venture not found." };

  const supabase = await createClient();
  const { error } = await supabase.from("ventures").delete().eq("id", id);
  if (error) return { error: friendlyDbError(error) };
  return done();
}
