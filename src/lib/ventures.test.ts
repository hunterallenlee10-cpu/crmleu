import { describe, expect, it } from "vitest";
import { parseCoLeads, parseVentureForm, parseVentureName, timelineInfo } from "./ventures";

const LEAD = "6a0e3b4c-1d2e-4f50-8a1b-2c3d4e5f6a7b";

function form(fields: Record<string, string>) {
  const fd = new FormData();
  const base = { name: "Websites", description: "", lead_id: "", status: "building", start_date: "", target_date: "" };
  for (const [k, v] of Object.entries({ ...base, ...fields })) fd.set(k, v);
  return fd;
}

describe("parseVentureName", () => {
  it("trims and collapses spaces", () => {
    expect(parseVentureName("  Podcast   Studio ")).toEqual({ ok: true, name: "Podcast Studio" });
  });
  it("rejects blank and overly long names", () => {
    expect(parseVentureName("   ").ok).toBe(false);
    expect(parseVentureName("x".repeat(41)).ok).toBe(false);
  });
});

describe("parseVentureForm", () => {
  it("turns blanks into nulls", () => {
    expect(parseVentureForm(form({}))).toEqual({
      ok: true,
      data: { name: "Websites", description: null, lead_id: null, status: "building", start_date: null, target_date: null },
    });
  });

  it("keeps the details", () => {
    const res = parseVentureForm(
      form({ description: "  Sites for local businesses ", lead_id: LEAD, status: "live", start_date: "2026-01-01", target_date: "2026-12-31" }),
    );
    expect(res).toEqual({
      ok: true,
      data: {
        name: "Websites",
        description: "Sites for local businesses",
        lead_id: LEAD,
        status: "live",
        start_date: "2026-01-01",
        target_date: "2026-12-31",
      },
    });
  });

  it("rejects a target before the start", () => {
    expect(parseVentureForm(form({ start_date: "2026-12-01", target_date: "2026-01-01" }))).toEqual({
      ok: false,
      error: "The target date can't be before the start date.",
    });
  });

  it("rejects a bad status, person or date", () => {
    expect(parseVentureForm(form({ status: "dead" })).ok).toBe(false);
    expect(parseVentureForm(form({ lead_id: "nope" })).ok).toBe(false);
    expect(parseVentureForm(form({ start_date: "2026-13-40" })).ok).toBe(false);
    expect(parseVentureForm(form({ name: " " })).ok).toBe(false);
  });
});

describe("parseCoLeads", () => {
  const A = "1a0e3b4c-1d2e-4f50-8a1b-2c3d4e5f6a7b";
  const B = "2a0e3b4c-1d2e-4f50-8a1b-2c3d4e5f6a7b";

  it("keeps each ticked person once and drops the lead", () => {
    expect(parseCoLeads([A, A, "", LEAD, B], LEAD)).toEqual({ ok: true, ids: [A, B] });
    expect(parseCoLeads([], null)).toEqual({ ok: true, ids: [] });
  });

  it("allows two co-leads at most", () => {
    expect(parseCoLeads([A, B, LEAD], null)).toEqual({ ok: false, error: "A venture can have up to 2 co-leads." });
  });

  it("rejects anything that isn't a person", () => {
    expect(parseCoLeads(["nope"], null).ok).toBe(false);
  });
});

describe("timelineInfo", () => {
  const today = "2026-10-22";

  it("says nothing without dates", () => {
    expect(timelineInfo(null, null, today)).toEqual({ fraction: null, note: null, late: false });
  });

  it("shows how far through the timeline we are", () => {
    const t = timelineInfo("2026-10-12", "2026-11-01", today);
    expect(t.fraction).toBeCloseTo(0.5);
    expect(t.note).toBe("10 days left");
    expect(t.late).toBe(false);
  });

  it("counts down to a start in the future", () => {
    expect(timelineInfo("2026-10-23", "2026-12-01", today)).toMatchObject({ fraction: 0, note: "Starts in 1 day" });
  });

  it("flags a target that has passed", () => {
    expect(timelineInfo("2026-01-01", "2026-10-20", today)).toEqual({ fraction: 1, note: "2 days past target", late: true });
    expect(timelineInfo(null, today, today)).toEqual({ fraction: null, note: "Target is today", late: false });
  });
});
