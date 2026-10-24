import { describe, expect, it } from "vitest";
import { canGive, giveSeat, openPromotions, sameTitle, seatsHeld, takeSeat, type Seats } from "./promotions";

const base: Seats = {
  ventures: [
    { id: "web", name: "Websites", leadId: null, coLeadIds: [] },
    { id: "ads", name: "Ads", leadId: "ann", coLeadIds: [] },
    { id: "seo", name: "SEO", leadId: "bob", coLeadIds: ["ann", "cat"] },
  ],
  people: [
    { id: "ann", title: "  president " },
    { id: "bob", title: null },
    { id: "cat", title: "Head of Growth" },
  ],
};

const labels = (s: Seats) => openPromotions(s).map((p) => p.label);

describe("openPromotions", () => {
  it("lists open titles, then a lead or co-lead seat per venture", () => {
    expect(labels(base)).toEqual(["CFO", "Sales Manager", "Websites Lead", "Ads Co-Lead"]);
  });

  it("gives each promotion a stable key", () => {
    expect(openPromotions(base).map((p) => p.key)).toEqual([
      "title:cfo",
      "title:sales manager",
      "lead:web",
      "co_lead:ads",
    ]);
  });
});

describe("giveSeat and takeSeat", () => {
  it("moves a promotion off the list and back", () => {
    const given = giveSeat(base, "bob", { kind: "lead", ventureId: "web" });
    expect(labels(given)).toEqual(["CFO", "Sales Manager", "Websites Co-Lead", "Ads Co-Lead"]);
    expect(labels(takeSeat(given, "bob", { kind: "lead", ventureId: "web" }))).toEqual(labels(base));
  });

  it("fills co-lead seats until there are two", () => {
    let s = giveSeat(base, "bob", { kind: "co_lead", ventureId: "ads" });
    expect(labels(s)).toContain("Ads Co-Lead");
    s = giveSeat(s, "cat", { kind: "co_lead", ventureId: "ads" });
    expect(labels(s)).not.toContain("Ads Co-Lead");
  });

  it("takes a co-lead off the list when they become the lead", () => {
    const s = giveSeat(base, "cat", { kind: "lead", ventureId: "seo" });
    expect(s.ventures.find((v) => v.id === "seo")).toMatchObject({ leadId: "cat", coLeadIds: ["ann"] });
  });

  it("replaces someone's title and frees the old one", () => {
    const s = giveSeat(base, "ann", { kind: "title", title: "CFO" });
    expect(labels(s).slice(0, 2)).toEqual(["President", "Sales Manager"]);
    expect(takeSeat(s, "ann", { kind: "title", title: "cfo" }).people[0].title).toBeNull();
    expect(takeSeat(s, "ann", { kind: "title", title: "President" }).people[0].title).toBe("CFO");
  });
});

describe("canGive", () => {
  it("explains why a promotion can't go to someone", () => {
    expect(canGive(base, "ann", { kind: "co_lead", ventureId: "ads" }, "Ann")).toEqual({ ok: false, error: "Ann already leads Ads." });
    expect(canGive(base, "ann", { kind: "co_lead", ventureId: "seo" })).toEqual({
      ok: false,
      error: "That person is already a co-lead on SEO.",
    });
    expect(canGive(base, "bob", { kind: "lead", ventureId: "ads" })).toEqual({ ok: false, error: "Ads already has a lead." });
    expect(canGive(base, "ann", { kind: "title", title: "President" }).ok).toBe(false);
    expect(canGive(base, "bob", { kind: "lead", ventureId: "gone" }).ok).toBe(false);
  });

  it("allows an open seat", () => {
    expect(canGive(base, "bob", { kind: "lead", ventureId: "web" })).toEqual({ ok: true });
    expect(canGive(base, "bob", { kind: "co_lead", ventureId: "ads" })).toEqual({ ok: true });
    expect(canGive(base, "bob", { kind: "title", title: "CFO" })).toEqual({ ok: true });
  });
});

describe("helpers", () => {
  it("compares titles ignoring case and spaces", () => {
    expect(sameTitle(" sales  manager", "Sales Manager")).toBe(true);
    expect(sameTitle(null, "CFO")).toBe(false);
  });

  it("lists what someone leads, leads first", () => {
    expect(seatsHeld(base.ventures, "ann").map((h) => `${h.venture.name}:${h.role}`)).toEqual(["Ads:lead", "SEO:co_lead"]);
  });
});
