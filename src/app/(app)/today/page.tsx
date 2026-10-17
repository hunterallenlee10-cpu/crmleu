import type { Metadata } from "next";
import Link from "next/link";
import { LeadRow } from "@/components/lead-row";
import { getProfile } from "@/lib/auth";
import { addDays, todayNY } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import type { Lead } from "@/lib/types";

export const metadata: Metadata = { title: "Today" };

const NEW_LEAD_WINDOW_DAYS = 7;

export default async function TodayPage() {
  const profile = await getProfile();
  const today = todayNY();
  const newSince = addDays(today, -NEW_LEAD_WINDOW_DAYS);

  // My open leads that are due (or overdue), plus fresh New leads assigned to me.
  const supabase = await createClient();
  const { data } = await supabase
    .from("leads")
    .select("*")
    .eq("owner_id", profile.id)
    .not("stage", "in", "(won,lost)")
    .or(`next_follow_up.lte.${today},and(stage.eq.new,assigned_at.gte.${newSince})`)
    .order("next_follow_up", { ascending: true, nullsFirst: false })
    .returns<Lead[]>();

  const leads = data ?? [];
  const overdue = leads.filter((l) => l.next_follow_up && l.next_follow_up < today);
  const dueToday = leads.filter((l) => l.next_follow_up === today);
  const fresh = leads
    .filter((l) => !l.next_follow_up || l.next_follow_up > today)
    .sort((a, b) => (b.assigned_at ?? "").localeCompare(a.assigned_at ?? ""));

  const firstName = profile.full_name.split(" ")[0];

  return (
    <div className="space-y-10">
      <div>
        <h1 className="page-title">Today</h1>
        <p className="mt-2 text-muted">
          Hi <span className="text-fg">{firstName}</span>.{" "}
          {overdue.length + dueToday.length === 0
            ? "No follow-ups due."
            : `${overdue.length + dueToday.length} follow-up${overdue.length + dueToday.length === 1 ? "" : "s"} to do.`}
        </p>
      </div>

      <Section title="Overdue" count={overdue.length} tone="text-danger" leads={overdue} today={today} />
      <Section title="Due today" count={dueToday.length} tone="text-gold" leads={dueToday} today={today} />
      <Section
        title="Newly assigned"
        count={fresh.length}
        tone="text-fg"
        leads={fresh}
        today={today}
        empty={
          <>
            No new leads in the last {NEW_LEAD_WINDOW_DAYS} days.{" "}
            <Link href="/leads/new" className="text-gold underline-offset-4 hover:underline">Add one</Link>
          </>
        }
      />
    </div>
  );
}

function Section({
  title,
  count,
  tone,
  leads,
  today,
  empty,
}: {
  title: string;
  count: number;
  tone: string;
  leads: Lead[];
  today: string;
  empty?: React.ReactNode;
}) {
  if (count === 0 && !empty) return null;
  return (
    <section className="space-y-4">
      <h2 className={`eyebrow flex items-center gap-3 ${tone}`}>
        {title} <span className="count">{count}</span>
        <span aria-hidden="true" className="h-px flex-1 bg-gradient-to-r from-line to-transparent" />
      </h2>
      {count === 0 ? (
        <p className="rounded-2xl border border-dashed border-line px-5 py-6 text-center text-sm text-muted">{empty}</p>
      ) : (
        <div className="space-y-3">
          {leads.map((lead) => (
            <LeadRow key={lead.id} lead={lead} today={today} />
          ))}
        </div>
      )}
    </section>
  );
}
