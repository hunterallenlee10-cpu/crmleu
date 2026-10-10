import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StageBadge } from "@/components/badges";
import { LeadForm } from "@/components/lead-form";
import { getProfile } from "@/lib/auth";
import { formatDate, formatDateTime, todayNY } from "@/lib/dates";
import { formatPhone } from "@/lib/normalize";
import { createClient } from "@/lib/supabase/server";
import { SERVICE_INTERESTS, type Activity, type ActivityType, type Lead } from "@/lib/types";
import { getNiches } from "@/lib/niches";
import { updateLead } from "../actions";
import { AdminLeadControls, DeleteActivityButton } from "./admin-controls";
import { FollowUpControl } from "./follow-up-control";
import { QuickLog } from "./quick-log";
import { StageControl } from "./stage-control";

export const metadata: Metadata = { title: "Lead" };

const ACTIVITY_LABELS: Record<ActivityType, string> = {
  call: "Call",
  text: "Text",
  email: "Email",
  meeting: "Meeting",
  note: "Note",
  stage_change: "Stage",
  reassignment: "Reassigned",
};

export default async function LeadPage({ params }: PageProps<"/leads/[id]">) {
  const profile = await getProfile();
  const isAdmin = profile.role === "admin";
  const { id } = await params;
  const supabase = await createClient();

  // RLS returns nothing if this lead isn't yours (unless you're an admin).
  const { data: lead } = await supabase.from("leads").select("*").eq("id", id).maybeSingle<Lead>();
  if (!lead) notFound();

  const [{ data: activities }, { data: team }, niches] = await Promise.all([
    supabase
      .from("activities")
      .select("*")
      .eq("lead_id", id)
      .order("created_at", { ascending: false })
      .returns<Activity[]>(),
    supabase.from("team_members").select("id, full_name, active"),
    getNiches(supabase),
  ]);

  const names = new Map((team ?? []).map((m) => [m.id as string, m.full_name as string]));
  const assignees = (team ?? [])
    .filter((m) => m.active)
    .map((m) => ({ value: m.id as string, label: m.full_name as string }));
  const today = todayNY();
  const place = [lead.city, lead.state].filter(Boolean).join(", ");
  const tel = lead.phone ? `+1${lead.phone}` : null;

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{lead.business_name}</h1>
          <StageBadge stage={lead.stage} />
        </div>
        <p className="text-muted">
          {[lead.contact_name, place, lead.niche].filter(Boolean).join(" · ")}
        </p>
        {lead.phone && <p className="text-lg">{formatPhone(lead.phone)}</p>}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {lead.email && <a href={`mailto:${lead.email}`} className="text-gold hover:underline">{lead.email}</a>}
          {lead.website && <a href={externalUrl(lead.website)} target="_blank" rel="noreferrer" className="text-gold hover:underline">Website</a>}
          {lead.spec_site_url && <a href={externalUrl(lead.spec_site_url)} target="_blank" rel="noreferrer" className="text-gold hover:underline">Spec site</a>}
          {lead.service_interest && (
            <span className="text-muted">
              Interested in {SERVICE_INTERESTS.find((s) => s.value === lead.service_interest)?.label.toLowerCase()}
            </span>
          )}
        </div>
        {lead.stage === "won" && lead.won_date && (
          <p className="text-sm text-gold">
            Won {formatDate(lead.won_date, today)} · ${Number(lead.deal_value).toLocaleString("en-US")}
          </p>
        )}
        {lead.stage === "lost" && lead.lost_reason && (
          <p className="text-sm text-danger">Lost: {lead.lost_reason}</p>
        )}
      </div>

      {/* Call / text, or a do-not-contact warning */}
      {lead.do_not_contact ? (
        <div role="alert" className="rounded-2xl border border-danger/50 bg-danger/10 p-5 text-danger">
          <p className="font-semibold">Do not contact</p>
          <p className="mt-1 text-sm">This business asked not to be contacted. Don&apos;t call or text them.</p>
        </div>
      ) : tel ? (
        <div className="grid grid-cols-2 gap-3">
          <a href={`tel:${tel}`} className="btn btn-gold min-h-14 text-lg">Call</a>
          <a href={`sms:${tel}`} className="btn btn-ghost min-h-14 text-lg">Text</a>
        </div>
      ) : (
        <p className="text-sm text-muted">No phone number yet. Add one below.</p>
      )}

      <Section title="Next follow-up">
        <FollowUpControl leadId={lead.id} date={lead.next_follow_up} today={today} />
      </Section>

      <Section title="Log activity">
        <QuickLog leadId={lead.id} />
      </Section>

      <Section title="Stage">
        <StageControl leadId={lead.id} stage={lead.stage} dealValue={lead.deal_value} />
      </Section>

      <Section title="History">
        {(activities ?? []).length === 0 ? (
          <p className="text-sm text-muted">Nothing logged yet.</p>
        ) : (
          <ol className="space-y-4">
            {(activities ?? []).map((a) => (
              <li key={a.id} className="border-l-2 border-line pl-4">
                <p className="text-sm">
                  <span className="font-medium text-gold">{ACTIVITY_LABELS[a.type]}</span>
                  <span className="text-muted">
                    {" · "}
                    {a.user_id ? names.get(a.user_id) ?? "Someone" : "System"}
                    {" · "}
                    {formatDateTime(a.created_at)}
                  </span>
                  {isAdmin && <DeleteActivityButton activityId={a.id} />}
                </p>
                {a.body && <p className="mt-1 whitespace-pre-wrap">{a.body}</p>}
              </li>
            ))}
          </ol>
        )}
      </Section>

      <Section title="Details">
        <LeadForm action={updateLead.bind(null, lead.id)} lead={lead} niches={niches} submitLabel="Save changes" />
      </Section>

      {isAdmin && (
        <Section title="Admin">
          <p className="text-sm text-muted">
            Owner: <span className="text-fg">{lead.owner_id ? names.get(lead.owner_id) ?? "Unknown" : "Unassigned"}</span>
            {" · "}Source: <span className="text-fg">{lead.source}</span>
          </p>
          <AdminLeadControls leadId={lead.id} ownerId={lead.owner_id} assignees={assignees} />
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card space-y-4">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">{title}</h2>
      {children}
    </section>
  );
}

function externalUrl(url: string) {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}
