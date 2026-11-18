"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/components/form-message";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Announcements: only admins post and delete them; the database enforces it too.

const Body = z
  .string()
  .trim()
  .min(1, "Write something to announce.")
  .max(2000, "Keep it under 2,000 characters.");

export async function postAnnouncement(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const raw = String(formData.get("body") ?? "");
  const parsed = Body.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0].message, fields: { body: raw } };

  const supabase = await createClient();
  const { error } = await supabase.from("announcements").insert({ body: parsed.data });
  if (error) return { error: error.message, fields: { body: raw } };

  revalidatePath("/today");
  return { message: "Posted." };
}

export async function deleteAnnouncement(id: string): Promise<{ error?: string }> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("announcements").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/today");
  return {};
}
