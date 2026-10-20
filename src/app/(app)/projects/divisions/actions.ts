"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { friendlyDbError } from "@/lib/leads";
import { MAX_DIVISIONS, parseDivisionName } from "@/lib/projects";
import { createClient } from "@/lib/supabase/server";

// Admins add, rename, reorder and remove divisions (the spokes on the
// Projects map). RLS and a foreign key enforce the same rules in the database.

type Result = { error?: string };
const DivisionId = z.guid();

function done(): Result {
  revalidatePath("/projects", "layout");
  return {};
}

export async function addDivision(rawName: string): Promise<Result> {
  await requireAdmin();
  const parsed = parseDivisionName(rawName);
  if (!parsed.ok) return { error: parsed.error };

  const supabase = await createClient();
  const { data: existing, error: readError } = await supabase
    .from("project_divisions")
    .select("position")
    .order("position", { ascending: false });
  if (readError) return { error: friendlyDbError(readError) };
  if ((existing?.length ?? 0) >= MAX_DIVISIONS) {
    return { error: `The map has room for ${MAX_DIVISIONS} divisions. Remove one first.` };
  }

  const position = existing?.length ? existing[0].position + 1 : 0;
  const { error } = await supabase.from("project_divisions").insert({ name: parsed.name, position });
  if (error) return { error: friendlyDbError(error) };
  return done();
}

export async function renameDivision(id: string, rawName: string): Promise<Result> {
  await requireAdmin();
  if (!DivisionId.safeParse(id).success) return { error: "Division not found." };
  const parsed = parseDivisionName(rawName);
  if (!parsed.ok) return { error: parsed.error };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_divisions")
    .update({ name: parsed.name })
    .eq("id", id)
    .select("id");
  if (error) return { error: friendlyDbError(error) };
  if (!data.length) return { error: "Division not found." };
  return done();
}

// Swap places with the neighbour above or below, which turns the spoke on the map.
export async function moveDivision(id: string, direction: "up" | "down"): Promise<Result> {
  await requireAdmin();
  if (!DivisionId.safeParse(id).success) return { error: "Division not found." };

  const supabase = await createClient();
  const { data: all, error: readError } = await supabase
    .from("project_divisions")
    .select("id, position")
    .order("position")
    .order("created_at");
  if (readError) return { error: friendlyDbError(readError) };

  const list = all ?? [];
  const from = list.findIndex((d) => d.id === id);
  if (from === -1) return { error: "Division not found." };
  const to = direction === "up" ? from - 1 : from + 1;
  if (to < 0 || to >= list.length) return {};

  // Write a clean 0..n order so ties from older data can't stall a move.
  const order = list.map((d) => d.id);
  [order[from], order[to]] = [order[to], order[from]];
  const changed = order
    .map((divisionId, position) => ({ id: divisionId, position }))
    .filter((d) => list.find((x) => x.id === d.id)!.position !== d.position);

  for (const d of changed) {
    const { error } = await supabase.from("project_divisions").update({ position: d.position }).eq("id", d.id);
    if (error) return { error: friendlyDbError(error) };
  }
  return done();
}

export async function removeDivision(id: string): Promise<Result> {
  await requireAdmin();
  if (!DivisionId.safeParse(id).success) return { error: "Division not found." };

  const supabase = await createClient();
  const { count, error: countError } = await supabase
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("division_id", id);
  if (countError) return { error: friendlyDbError(countError) };
  if (count) {
    return {
      error: `This division still has ${count} project${count === 1 ? "" : "s"}. Move ${count === 1 ? "it" : "them"} to another division first.`,
    };
  }

  const { error } = await supabase.from("project_divisions").delete().eq("id", id);
  if (error) return { error: friendlyDbError(error) };
  return done();
}
