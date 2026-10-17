import type { Metadata } from "next";
import Link from "next/link";
import { todayNY } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { getTeam } from "@/lib/team";
import { STAGES, type ActivityType, type Profile, type Stage } from "@/lib/types";

export const metadata: Metadata = { title: "Dashboard" };

type StageCount = { owner_id: string | null; stage: Stage; lead_count: number };
type ActivityCount = { user_id: string; type: ActivityType; activity_count: number };
type WonRow = { owner_id: string | null; deals: number; revenue: number };

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

// Admin dashboard. The admin layout already checked the role, and the
// dashboard_* functions run under RLS, so only admins get everyone's numbers.
export default async function DashboardPage() {
  const supabase = await createClient();
  const [team, stageRes, activityRes, wonRes] = await Promise.all([
    getTeam(supabase),
    supabase.rpc("dashboard_stage_counts"),
    supabase.rpc("dashboard_activity_counts"),
    supabase.rpc("dashboard_won_this_month"),
  ]);
  const stageCounts = (stageRes.data ?? []) as StageCount[];
  const activityCounts = (activityRes.data ?? []) as ActivityCount[];
  const won = (wonRes.data ?? []) as WonRow[];

  // Rows: everyone who owns leads or did something, plus active reps.
  const people = team.filter(
    (m) =>
      m.active ||
      stageCounts.some((s) => s.owner_id === m.id) ||
      activityCounts.some((a) => a.user_id === m.id),
  );
  const hasUnassigned = stageCounts.some((s) => s.owner_id === null);

  const leadsFor = (ownerId: string | null, stage?: Stage) =>
    stageCounts
      .filter((s) => s.owner_id === ownerId && (!stage || s.stage === stage))
      .reduce((sum, s) => sum + Number(s.lead_count), 0);
  const activitiesFor = (userId: string, types?: ActivityType[]) =>
    activityCounts
      .filter((a) => a.user_id === userId && (!types || types.includes(a.type)))
      .reduce((sum, a) => sum + Number(a.activity_count), 0);
  const wonFor = (ownerId: string) => won.find((w) => w.owner_id === ownerId);

  const totalDeals = won.reduce((s, w) => s + Number(w.deals), 0);
  const totalRevenue = won.reduce((s, w) => s + Number(w.revenue), 0);
  // Admins own the business, so they never earn commission on their own wins.
  const rateFor = (m: Profile) => (m.role === "admin" ? 0 : Number(m.commission_rate));
  const commissionFor = (m: Profile) => (Number(wonFor(m.id)?.revenue ?? 0) * rateFor(m)) / 100;
  const totalCommission = team.reduce((s, m) => s + commissionFor(m), 0);
  const totalActivities = activityCounts.reduce((s, a) => s + Number(a.activity_count), 0);

  const month = new Date(`${todayNY()}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    timeZone: "UTC",
  });

  return (
    <div className="space-y-10">
      {/* Headline + tiles */}
      <section className="grid gap-4 lg:grid-cols-4">
        <div className="card card-glow flex flex-col justify-between p-6 lg:col-span-2">
          <p className="text-sm text-muted">Revenue won in {month}</p>
          <p className="mt-3 bg-gradient-to-b from-gold-light to-gold bg-clip-text text-5xl font-semibold tracking-tight text-transparent tabular-nums sm:text-6xl">
            {money(totalRevenue)}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-4 lg:col-span-2">
          <Tile label={`Deals won in ${month}`} value={totalDeals.toLocaleString("en-US")} />
          <Tile label="Commission owed" value={money(totalCommission)} />
          <Tile label="Activities this week" value={totalActivities.toLocaleString("en-US")} />
        </div>
      </section>

      {/* Leads per stage per rep */}
      <Table title="Leads by stage" caption="Every lead each person owns right now.">
        <thead>
          <tr>
            <Th left>Owner</Th>
            {STAGES.map((s) => <Th key={s.value}>{s.label}</Th>)}
            <Th>Total</Th>
          </tr>
        </thead>
        <tbody>
          {people.map((m) => (
            <tr key={m.id}>
              <Td left>
                <Link href={`/leads?owner=${m.id}`} className="hover:text-gold">{m.full_name}</Link>
                {!m.active && <span className="ml-2 rounded-full border border-danger/30 px-1.5 py-px text-xs text-danger">inactive</span>}
              </Td>
              {STAGES.map((s) => <Td key={s.value}>{leadsFor(m.id, s.value) || "–"}</Td>)}
              <Td strong>{leadsFor(m.id)}</Td>
            </tr>
          ))}
          {hasUnassigned && (
            <tr>
              <Td left><Link href="/leads?owner=unassigned" className="hover:text-gold">Unassigned</Link></Td>
              {STAGES.map((s) => <Td key={s.value}>{leadsFor(null, s.value) || "–"}</Td>)}
              <Td strong>{leadsFor(null)}</Td>
            </tr>
          )}
        </tbody>
      </Table>

      {/* Activities this week */}
      <Table title="Activities this week" caption="Monday to today, New York time.">
        <thead>
          <tr>
            <Th left>Rep</Th>
            <Th>Calls</Th>
            <Th>Texts</Th>
            <Th>Notes</Th>
            <Th>Other</Th>
            <Th>Total</Th>
          </tr>
        </thead>
        <tbody>
          {people.map((m) => (
            <tr key={m.id}>
              <Td left>{m.full_name}</Td>
              <Td>{activitiesFor(m.id, ["call"])}</Td>
              <Td>{activitiesFor(m.id, ["text"])}</Td>
              <Td>{activitiesFor(m.id, ["note"])}</Td>
              <Td>{activitiesFor(m.id, ["email", "meeting", "stage_change", "reassignment"])}</Td>
              <Td strong>{activitiesFor(m.id)}</Td>
            </tr>
          ))}
        </tbody>
      </Table>

      {/* Won + commission this month */}
      <Table title={`Won in ${month} and commission owed`} caption="Commission = won deal value × the rep's commission rate.">
        <thead>
          <tr>
            <Th left>Rep</Th>
            <Th>Deals</Th>
            <Th>Revenue</Th>
            <Th>Rate</Th>
            <Th>Commission</Th>
          </tr>
        </thead>
        <tbody>
          {people.map((m) => {
            const w = wonFor(m.id);
            return (
              <tr key={m.id}>
                <Td left>{m.full_name}</Td>
                <Td>{Number(w?.deals ?? 0)}</Td>
                <Td>{money(Number(w?.revenue ?? 0))}</Td>
                <Td>{m.role === "admin" ? "–" : `${rateFor(m)}%`}</Td>
                <Td strong>{m.role === "admin" ? "–" : money(commissionFor(m))}</Td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-line-strong">
            <Td left strong>Total</Td>
            <Td strong>{totalDeals}</Td>
            <Td strong>{money(totalRevenue)}</Td>
            <Td />
            <Td strong>{money(totalCommission)}</Td>
          </tr>
        </tfoot>
      </Table>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="card flex flex-col justify-between p-4">
      <p className="text-xs leading-snug text-muted">{label}</p>
      <p className="mt-3 text-xl font-semibold tracking-tight tabular-nums sm:text-2xl">{value}</p>
    </div>
  );
}

function Table({ title, caption, children }: { title: string; caption: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <p className="mt-0.5 text-sm text-muted">{caption}</p>
      </div>
      <div className="card -mx-5 overflow-x-auto rounded-none border-x-0 bg-none p-0 sm:mx-0 sm:rounded-2xl sm:border-x">
        <table className="w-full min-w-max text-sm tabular-nums [&_tbody_tr+tr]:border-t [&_tbody_tr+tr]:border-line/70">{children}</table>
      </div>
    </section>
  );
}

function Th({ children, left }: { children: React.ReactNode; left?: boolean }) {
  return (
    <th className={`border-b border-line bg-raised px-4 py-3 text-xs font-semibold tracking-wider text-muted uppercase ${left ? "sticky left-0 text-left" : "text-right"}`}>
      {children}
    </th>
  );
}

function Td({ children, left, strong }: { children?: React.ReactNode; left?: boolean; strong?: boolean }) {
  return (
    // The name column stays put while the numbers scroll sideways on phones.
    <td className={`px-4 py-3.5 ${left ? "sticky left-0 bg-panel text-left font-medium" : "text-right"} ${strong ? "font-semibold text-fg" : ""}`}>{children}</td>
  );
}
