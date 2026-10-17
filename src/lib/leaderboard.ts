// Team board on the Today page: leaderboard scoring and the 24-hour feed.
// Rows come from team_leaderboard() and team_feed() in
// supabase/migrations/20261013100000_team_board.sql.

import { stageLabel, type ActivityType, type Stage } from "@/lib/types";

export type Period = "day" | "week" | "month";

export const PERIODS: { value: Period; label: string }[] = [
  { value: "day", label: "Today" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
];

export type BoardRow = {
  user_id: string;
  full_name: string;
  outreach: number;
  warm_ups: number;
  calls_booked: number;
  deals_won: number;
  revenue: number;
};

export type Metric = "points" | "outreach" | "warm_ups" | "calls_booked" | "deals_won" | "revenue";

export const METRICS: { value: Metric; label: string; short: string }[] = [
  { value: "points", label: "Points", short: "Points" },
  { value: "outreach", label: "Outreach", short: "Outreach" },
  { value: "warm_ups", label: "Warm ups", short: "Warm ups" },
  { value: "calls_booked", label: "Calls booked", short: "Booked" },
  { value: "deals_won", label: "Deals won", short: "Won" },
  { value: "revenue", label: "Revenue", short: "Revenue" },
];

// What each thing is worth on the Points board.
export const POINTS = { outreach: 1, warm_ups: 5, calls_booked: 10, deals_won: 25 } as const;

export function pointsFor(row: BoardRow): number {
  return (
    row.outreach * POINTS.outreach +
    row.warm_ups * POINTS.warm_ups +
    row.calls_booked * POINTS.calls_booked +
    row.deals_won * POINTS.deals_won
  );
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
    warm_ups: Number(r.warm_ups ?? 0),
    calls_booked: Number(r.calls_booked ?? 0),
    deals_won: Number(r.deals_won ?? 0),
    revenue: Number(r.revenue ?? 0),
  }));
}

// ---------------------------------------------------------------------------
// Feed

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

// "called Harbor Plumbing" / "logged a call" / "moved a lead to Warm Up Program"
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

export type PersonDay = {
  user_id: string;
  name: string;
  calls: number;
  texts: number;
  emails: number;
  meetings: number;
  notes: number;
  warmUps: number;
  booked: number;
  quotes: number;
  wins: number;
  revenue: number;
  total: number;
};

// One line per person: what they did in the feed's window, busiest first.
export function summarizeByPerson(items: FeedItem[]): PersonDay[] {
  const byUser = new Map<string, PersonDay>();
  for (const item of items) {
    let p = byUser.get(item.user_id);
    if (!p) {
      p = {
        user_id: item.user_id, name: item.actor_name, calls: 0, texts: 0, emails: 0, meetings: 0,
        notes: 0, warmUps: 0, booked: 0, quotes: 0, wins: 0, revenue: 0, total: 0,
      };
      byUser.set(item.user_id, p);
    }
    p.total++;
    if (item.type === "call") p.calls++;
    else if (item.type === "text") p.texts++;
    else if (item.type === "email") p.emails++;
    else if (item.type === "meeting") p.meetings++;
    else if (item.type === "note") p.notes++;
    else if (item.type === "stage_change") {
      if (item.to_stage === "warm_up_program") p.warmUps++;
      else if (item.to_stage === "call_booked") p.booked++;
      else if (item.to_stage === "quote_given") p.quotes++;
      else if (item.to_stage === "won") {
        p.wins++;
        p.revenue += item.deal_value ?? 0;
      }
    }
  }
  return [...byUser.values()].sort(
    (a, b) => b.wins - a.wins || b.total - a.total || a.name.localeCompare(b.name),
  );
}

// ["12 calls", "1 text", "2 warm ups"] — only the non-zero ones.
export function personHighlights(p: PersonDay): string[] {
  const parts: [number, string, string][] = [
    [p.wins, "win", "wins"],
    [p.booked, "call booked", "calls booked"],
    [p.quotes, "quote given", "quotes given"],
    [p.warmUps, "warm up", "warm ups"],
    [p.calls, "call", "calls"],
    [p.texts, "text", "texts"],
    [p.emails, "email", "emails"],
    [p.meetings, "meeting", "meetings"],
    [p.notes, "note", "notes"],
  ];
  return parts.filter(([n]) => n > 0).map(([n, one, many]) => `${n} ${n === 1 ? one : many}`);
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
