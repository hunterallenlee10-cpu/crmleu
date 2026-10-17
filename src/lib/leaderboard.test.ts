import { describe, expect, it } from "vitest";
import {
  describeItem,
  leaderOf,
  personHighlights,
  pointsFor,
  rankBy,
  summarizeByPerson,
  timeAgo,
  toBoardRows,
  type BoardRow,
  type FeedItem,
} from "./leaderboard";

const row = (full_name: string, r: Partial<BoardRow> = {}): BoardRow => ({
  user_id: full_name,
  full_name,
  outreach: 0,
  warm_ups: 0,
  calls_booked: 0,
  deals_won: 0,
  revenue: 0,
  ...r,
});

describe("pointsFor", () => {
  it("weights outcomes above outreach", () => {
    expect(pointsFor(row("A", { outreach: 10, warm_ups: 2, calls_booked: 1, deals_won: 1 }))).toBe(10 + 10 + 10 + 25);
  });
});

describe("rankBy", () => {
  it("sorts highest first and ties share a rank", () => {
    const ranked = rankBy(
      [row("Cara", { outreach: 3 }), row("Abe", { outreach: 9 }), row("Bo", { outreach: 3, deals_won: 1 })],
      "outreach",
    );
    expect(ranked.map((r) => [r.full_name, r.rank])).toEqual([
      ["Abe", 1],
      ["Bo", 2], // tied with Cara on outreach, ahead on points
      ["Cara", 2],
    ]);
  });

  it("ranks by points", () => {
    const ranked = rankBy([row("A", { outreach: 20 }), row("B", { deals_won: 1 })], "points");
    expect(ranked[0].full_name).toBe("B");
    expect(ranked[0].points).toBe(25);
  });
});

describe("leaderOf", () => {
  it("is nobody when nobody has scored or the top is tied", () => {
    expect(leaderOf([row("A"), row("B")], "revenue")).toBeNull();
    expect(leaderOf([row("A", { revenue: 5 }), row("B", { revenue: 5 })], "revenue")).toBeNull();
    expect(leaderOf([row("A", { revenue: 5 }), row("B", { revenue: 9 })], "revenue")?.full_name).toBe("B");
  });
});

describe("toBoardRows", () => {
  it("turns bigint/numeric strings into numbers", () => {
    expect(toBoardRows([{ user_id: "u", full_name: "A", outreach: "4", warm_ups: 1, calls_booked: "0", deals_won: "2", revenue: "1500.00" }]))
      .toEqual([row("A", { user_id: "u", outreach: 4, warm_ups: 1, deals_won: 2, revenue: 1500 })]);
    expect(toBoardRows(null)).toEqual([]);
  });
});

const item = (r: Partial<FeedItem>): FeedItem => ({
  id: 1,
  created_at: "2026-10-13T12:00:00Z",
  user_id: "u1",
  actor_name: "Rep A",
  type: "call",
  to_stage: null,
  deal_value: null,
  lead_id: null,
  business_name: null,
  ...r,
});

describe("describeItem", () => {
  it("names the business only when the viewer can see it", () => {
    expect(describeItem(item({ type: "call" }))).toMatchObject({ verb: "logged a call", lead: null });
    expect(describeItem(item({ type: "call", business_name: "Harbor Plumbing" }))).toMatchObject({ verb: "called", lead: "Harbor Plumbing" });
  });

  it("describes stage changes", () => {
    expect(describeItem(item({ type: "stage_change", to_stage: "warm_up_program" }))).toMatchObject({ verb: "moved a lead", suffix: "to Warm Up Program", tone: "stage" });
    expect(describeItem(item({ type: "stage_change", to_stage: "won" }))).toMatchObject({ verb: "closed a deal", tone: "win" });
    expect(describeItem(item({ type: "stage_change", to_stage: "lost", business_name: "X" }))).toMatchObject({ verb: "marked", lead: "X", suffix: "Lost" });
  });
});

describe("summarizeByPerson", () => {
  it("rolls the feed up per person, winners first", () => {
    const people = summarizeByPerson([
      item({ user_id: "a", actor_name: "Ann", type: "call" }),
      item({ user_id: "a", actor_name: "Ann", type: "call" }),
      item({ user_id: "a", actor_name: "Ann", type: "text" }),
      item({ user_id: "b", actor_name: "Ben", type: "stage_change", to_stage: "won", deal_value: 2500 }),
      item({ user_id: "b", actor_name: "Ben", type: "stage_change", to_stage: "warm_up_program" }),
    ]);
    expect(people.map((p) => p.name)).toEqual(["Ben", "Ann"]);
    expect(people[1]).toMatchObject({ calls: 2, texts: 1, total: 3 });
    expect(people[0]).toMatchObject({ wins: 1, revenue: 2500, warmUps: 1 });
    expect(personHighlights(people[0])).toEqual(["1 win", "1 warm up"]);
    expect(personHighlights(people[1])).toEqual(["2 calls", "1 text"]);
  });
});

describe("timeAgo", () => {
  const now = new Date("2026-10-13T12:00:00Z");
  it.each([
    ["2026-10-13T11:59:40Z", "just now"],
    ["2026-10-13T11:55:00Z", "5m ago"],
    ["2026-10-13T09:00:00Z", "3h ago"],
    ["2026-10-11T12:00:00Z", "2d ago"],
  ])("%s -> %s", (iso, expected) => {
    expect(timeAgo(iso, now)).toBe(expected);
  });
});
