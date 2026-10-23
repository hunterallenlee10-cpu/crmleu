import type { Metadata } from "next";
import { getProfile } from "@/lib/auth";
import { emailEnabled } from "@/lib/email";
import { createClient } from "@/lib/supabase/server";
import { getTeam } from "@/lib/team";
import type { Stage } from "@/lib/types";
import { InviteForm } from "./invite-form";
import { MemberRow } from "./member-row";
import { ReassignPrompt } from "./reassign-prompt";

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage() {
  const me = await getProfile(); // admin layout already checked the role
  const supabase = await createClient();
  const [team, { data: counts }] = await Promise.all([
    getTeam(supabase),
    supabase.rpc("dashboard_stage_counts"),
  ]);
  type Count = { owner_id: string | null; stage: Stage; lead_count: number };

  const openLeads = (id: string) =>
    ((counts ?? []) as Count[])
      .filter((c) => c.owner_id === id && c.stage !== "won" && c.stage !== "lost")
      .reduce((sum, c) => sum + Number(c.lead_count), 0);

  const needsReassign = team.filter((m) => !m.active && openLeads(m.id) > 0);
  // Deactivated people are tucked away below so the list shows the current team.
  const active = team.filter((m) => m.active);
  const inactive = team.filter((m) => !m.active);
  const assignees = active.map((m) => ({ id: m.id, name: m.full_name }));
  const names = Object.fromEntries(team.map((m) => [m.id, m.full_name]));

  return (
    <div className="space-y-8">
      <h1 className="page-title">Team</h1>
      {needsReassign.map((m) => (
        <ReassignPrompt key={m.id} from={{ id: m.id, name: m.full_name }} openLeads={openLeads(m.id)} assignees={assignees} />
      ))}
      <InviteForm emailEnabled={emailEnabled()} />
      <ul className="space-y-2">
        {active.map((m) => (
          <MemberRow key={m.id} member={m} isMe={m.id === me.id} openLeads={openLeads(m.id)} managers={assignees} names={names} />
        ))}
      </ul>
      {inactive.length > 0 && (
        <details>
          <summary className="cursor-pointer rounded-control text-label font-medium text-muted transition-colors duration-150 hover:text-fg">
            Inactive ({inactive.length})
          </summary>
          <ul className="mt-3 space-y-2">
            {inactive.map((m) => (
              <MemberRow key={m.id} member={m} isMe={m.id === me.id} openLeads={openLeads(m.id)} managers={assignees} names={names} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
