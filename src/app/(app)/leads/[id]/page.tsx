import type { Metadata } from "next";
import { ArrowUpRight, Ban, History, Mail, MessageSquare, Phone } from "lucide-react";
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
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div className="space-y-3 pb-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="page-title">{lead.business_name}</h1>
          <StageBadge stage={lead.stage} />
        </div>
        <p className="text-muted">
          {[lead.contact_name, place, lead.niche].filter(Boolean).join(" · ")}
        </p>
        {lead.phone && <p className="text-lg font-medium">{formatPhone(lead.phone)}</p>}
        <div className="flex flex-wrap items-center gap-2">
          {lead.email && <a href={`mailto:${lead.email}`} className={LINK_PILL}><Mail aria-hidden="true" className="size-3.5 text-muted" strokeWidth={1.75} />{lead.email}</a>}
          {lead.website && <a href={externalUrl(lead.website)} target="_blank" rel="noreferrer" className={LINK_PILL}>Website <ArrowUpRight aria-hidden="true" className="size-3.5 text-muted" strokeWidth={1.75} /></a>}
          {lead.spec_site_url && <a href={externalUrl(lead.spec_site_url)} target="_blank" rel="noreferrer" className={LINK_PILL}>Spec site <ArrowUpRight aria-hidden="true" className="size-3.5 text-muted" strokeWidth={1.75} /></a>}
          {lead.service_interest && (
            <span className="px-1 text-label text-muted">
              Interested in {SERVICE_INTERESTS.find((s) => s.value === lead.service_interest)?.label.toLowerCase()}
            </span>
          )}
        </div>
        {lead.stage === "won" && lead.won_date && (
          <p className="pill pill-success">
            Won {formatDate(lead.won_date, today)} · ${Number(lead.deal_value).toLocaleString("en-US")}
          </p>
        )}
        {lead.stage === "lost" && lead.lost_reason && (
          <p className="pill pill-danger whitespace-normal">Lost: {lead.lost_reason}</p>
        )}
      </div>

      {/* Call / text, or a do-not-contact warning */}
      {lead.do_not_contact ? (
        <div role="alert" className="flex gap-3 rounded-card border border-danger/30 bg-danger/[0.08] p-4 text-danger">
          <Ban aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={2} />
          <div>
            <p className="font-semibold">Do not contact</p>
            <p className="mt-0.5 text-label">This business asked not to be contacted. Don&apos;t call or text them.</p>
          </div>
        </div>
      ) : tel ? (
        <div className="grid grid-cols-2 gap-3">
          <a href={`tel:${tel}`} className="btn btn-primary min-h-12 text-base sm:min-h-12"><Phone aria-hidden="true" className="size-4" strokeWidth={2} />Call</a>
          <a href={`sms:${tel}`} className="btn btn-secondary min-h-12 text-base sm:min-h-12"><MessageSquare aria-hidden="true" className="size-4" strokeWidth={2} />Text</a>
        </div>
      ) : (
        <div className="empty py-5">
          <Phone aria-hidden="true" className="empty-icon" strokeWidth={1.75} />
          <p>No phone number yet. Add one below.</p>
        </div>
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
          <div className="empty py-6">
            <History aria-hidden="true" className="empty-icon" strokeWidth={1.75} />
            <p>Nothing logged yet.</p>
          </div>
        ) : (
          <ol>
            {(activities ?? []).map((a) => (
              <li
                key={a.id}
                className="relative border-l border-line pb-5 pl-5 before:absolute before:top-1.5 before:-left-[4.5px] before:size-2 before:rounded-full before:border before:border-line-strong before:bg-surface-2 last:border-transparent last:pb-0"
              >
                <p className="text-label">
                  <span className="font-medium text-fg">{ACTIVITY_LABELS[a.type]}</span>
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
          <p className="text-label text-muted">
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
      <h2 className="text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

const LINK_PILL =
  "inline-flex min-h-9 items-center gap-1.5 rounded-control border border-line bg-surface px-2.5 text-label font-medium text-fg transition-colors duration-150 hover:border-line-strong hover:bg-surface-2 sm:min-h-8";

function externalUrl(url: string) {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}
