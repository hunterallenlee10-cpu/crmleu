// Team board on the Today page: leaderboard scoring and the 24-hour feed.
// Rows come from team_leaderboard() and team_feed() in
// supabase/migrations/20261013100000_team_board.sql.

import { stageLabel, type ActivityType, type Stage } from "@/lib/types";

export type Period = "day" | "week" | "month" | "all";

// The leaderboard opens on this one.
export const DEFAULT_PERIOD: Period = "all";

export const PERIODS: { value: Period; label: string }[] = [
  { value: "day", label: "Today" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "all", label: "All time" },
];

export type BoardRow = {
  user_id: string;
  full_name: string;
  outreach: number;
  calls_booked: number;
  deals_won: number;
  revenue: number;
  sale_bonus: number; // per won deal: dollars over $499, rounded up, summed
};

export type Metric = "points" | "outreach" | "calls_booked" | "deals_won" | "revenue";

export const METRICS: { value: Metric; label: string; short: string }[] = [
  { value: "points", label: "Points", short: "Points" },
  { value: "outreach", label: "Outreach", short: "Outreach" },
  { value: "calls_booked", label: "Calls booked", short: "Booked" },
  { value: "deals_won", label: "Deals won", short: "Won" },
  { value: "revenue", label: "Revenue", short: "Revenue" },
];

// Points come only from closed sales: 100 per deal won, plus a point for every
// dollar of the sale over $499, rounded up ($750.40 -> 100 + 252). The bonus is
// per deal, so team_leaderboard() works it out (sale_bonus) in
// supabase/migrations/20261115211941_points_closed_sales.sql.
export const POINTS = { deal_won: 100, bonus_over: 499 } as const;

export function pointsFor(row: BoardRow): number {
  return row.deals_won * POINTS.deal_won + row.sale_bonus;
}

export function metricValue(row: BoardRow, metric: Metric): number {
  return metric === "points" ? pointsFor(row) : row[metric];
}

export type RankedRow = BoardRow & { points: number; rank: number };

// Highest first. Ties share a rank (1, 1, 3) and are broken for display by
// points, then name.
export function rankBy(rows: BoardRow[], metric: Metric): RankedRow[] {
  const sorted = rows
    .map((r) => ({ ...r, points: pointsFor(r) }))
    .sort(
      (a, b) =>
        metricValue(b, metric) - metricValue(a, metric) ||
        b.points - a.points ||
        a.full_name.localeCompare(b.full_name),
    );
  let rank = 0;
  return sorted.map((row, i) => {
    if (i === 0 || metricValue(row, metric) !== metricValue(sorted[i - 1], metric)) rank = i + 1;
    return { ...row, rank };
  });
}

// The leader of each board, or null if nobody has scored yet (or it's a tie at the top).
export function leaderOf(rows: BoardRow[], metric: Metric): RankedRow | null {
  const [first, second] = rankBy(rows, metric);
  if (!first || metricValue(first, metric) === 0) return null;
  if (second && second.rank === first.rank) return null;
  return first;
}

// Supabase returns bigint and numeric columns as strings or numbers.
export function toBoardRows(data: unknown): BoardRow[] {
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    user_id: String(r.user_id),
    full_name: String(r.full_name),
    outreach: Number(r.outreach ?? 0),
    calls_booked: Number(r.calls_booked ?? 0),
    deals_won: Number(r.deals_won ?? 0),
    revenue: Number(r.revenue ?? 0),
    sale_bonus: Number(r.sale_bonus ?? 0),
  }));
}

// ---------------------------------------------------------------------------
// Weekly outreach goal

// Every rep aims for this many touches a week. A touch is any work on a lead
// (a logged call, text, email, meeting or note, a stage move, a follow-up date,
// an edit), counted once per lead per day. See
// supabase/migrations/20261118200000_weekly_touches.sql.
export const WEEKLY_TOUCH_GOAL = 100;

// Rows from team_weekly_touches(): every active rep, this week (Monday to Sunday).
export type WeeklyTouches = { user_id: string; full_name: string; touches: number };

export function toWeeklyTouches(data: unknown): WeeklyTouches[] {
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    user_id: String(r.user_id),
    full_name: String(r.full_name),
    touches: Number(r.touches ?? 0),
  }));
}

// Days left in the week, today included: 7 on Monday, 1 on Sunday.
export function daysLeftInWeek(today: string): number {
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay(); // 0 = Sunday
  return weekday === 0 ? 1 : 8 - weekday;
}

// What it takes to hit the goal from here: how many are left, and how many a
// day that is through Sunday (rounded up).
export function goalPace(touches: number, today: string, goal: number = WEEKLY_TOUCH_GOAL) {
  const left = Math.max(goal - touches, 0);
  return { left, perDay: Math.ceil(left / daysLeftInWeek(today)) };
}

// ---------------------------------------------------------------------------
// Feed

// Rows from team_lead_counts(): the active reps holding the most leads.
export type LeadCount = { user_id: string; full_name: string; lead_count: number };

export function toLeadCounts(data: unknown): LeadCount[] {
  return ((data ?? []) as LeadCount[]).map((r) => ({ ...r, lead_count: Number(r.lead_count) }));
}

export type FeedItem = {
  id: number;
  created_at: string;
  user_id: string;
  actor_name: string;
  type: ActivityType;
  to_stage: Stage | null;
  deal_value: number | null;
  lead_id: string | null; // null when it's someone else's lead
  business_name: string | null;
};

export function toFeedItems(data: unknown): FeedItem[] {
  return ((data ?? []) as FeedItem[]).map((r) => ({
    ...r,
    deal_value: r.deal_value == null ? null : Number(r.deal_value),
  }));
}

export type FeedLine = {
  verb: string;
  lead: string | null; // business name, only on leads the viewer can see
  suffix: string | null;
  tone: "win" | "lost" | "stage" | "plain";
};

// "called Harbor Plumbing" / "logged a call" / "moved a lead to Call Booked"
export function describeItem(item: FeedItem): FeedLine {
  const lead = item.business_name;
  const plain = (withLead: string, without: string): FeedLine =>
    ({ verb: lead ? withLead : without, lead, suffix: null, tone: "plain" });
  switch (item.type) {
    case "call":
      return plain("called", "logged a call");
    case "text":
      return plain("texted", "sent a text");
    case "email":
      return plain("emailed", "sent an email");
    case "meeting":
      return plain("met with", "had a meeting");
    case "note":
      return plain("added a note on", "added a note");
    case "stage_change":
      if (item.to_stage === "won") return { verb: lead ? "closed" : "closed a deal", lead, suffix: null, tone: "win" };
      if (item.to_stage === "lost") return { verb: lead ? "marked" : "marked a lead", lead, suffix: "Lost", tone: "lost" };
      return {
        verb: lead ? "moved" : "moved a lead",
        lead,
        suffix: `to ${item.to_stage ? stageLabel(item.to_stage) : "a new stage"}`,
        tone: "stage",
      };
    default:
      return plain("worked on", "logged an activity");
  }
}

// "just now" / "5m ago" / "3h ago" / "2d ago"
export function timeAgo(iso: string, now: Date = new Date()): string {
  const minutes = Math.floor((now.getTime() - Date.parse(iso)) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
