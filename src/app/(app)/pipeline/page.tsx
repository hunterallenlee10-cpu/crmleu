import type { Metadata } from "next";
import { getProfile } from "@/lib/auth";
import { todayNY } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import type { Lead } from "@/lib/types";
import { PipelineBoard } from "./board";

export const metadata: Metadata = { title: "Pipeline" };

export default async function PipelinePage() {
  const profile = await getProfile();
  const supabase = await createClient();
  const { data } = await supabase
    .from("leads")
    .select("*")
    .eq("owner_id", profile.id)
    .order("next_follow_up", { ascending: true, nullsFirst: false })
    .returns<Lead[]>();

  const leads = data ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title">Pipeline</h1>
        <p className="mt-1 text-sm text-muted">
          <span className="md:hidden">Press and hold a card, then drag it to another stage.</span>
          <span className="hidden md:inline">Drag a card to another stage.</span>
        </p>
      </div>
      <PipelineBoard initialLeads={leads} today={todayNY()} />
    </div>
  );
}
