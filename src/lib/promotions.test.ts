import { describe, expect, it } from "vitest";
import {
  canGive,
  giveSeat,
  openPromotions,
  parseNewPromotion,
  sameTitle,
  takeSeat,
  venturesLed,
  type Seats,
} from "./promotions";

const base: Seats = {
  ventures: [
    { id: "web", name: "Websites", leadId: null },
    { id: "ads", name: "Ads", leadId: "ann" },
  ],
  people: [
    { id: "ann", title: "  president " },
    { id: "bob", title: null },
  ],
  titles: [
    { id: "p1", title: "President" },
    { id: "p2", title: "CFO" },
    { id: null, title: "Sales Manager" },
  ],
};

const labels = (s: Seats) => openPromotions(s).map((p) => p.label);

describe("openPromotions", () => {
  it("lists untaken titles, then each venture without a lead", () => {
    expect(labels(base)).toEqual(["CFO", "Sales Manager", "Websites Lead"]);
  });

  it("says which ones can be removed", () => {
    expect(openPromotions(base).map((p) => [p.key, p.removableId])).toEqual([
      ["title:cfo", "p2"],
      ["title:sales manager", null],
      ["lead:web", null],
    ]);
  });
});

describe("giveSeat and takeSeat", () => {
  it("moves a lead seat off the list and back", () => {
    const given = giveSeat(base, "bob", { kind: "lead", ventureId: "web" });
    expect(labels(given)).toEqual(["CFO", "Sales Manager"]);
    expect(labels(takeSeat(given, "bob", { kind: "lead", ventureId: "web" }))).toEqual(labels(base));
  });

  it("replaces someone's title and frees the old one", () => {
    const s = giveSeat(base, "ann", { kind: "title", title: "CFO" });
    expect(labels(s).slice(0, 2)).toEqual(["President", "Sales Manager"]);
    expect(takeSeat(s, "ann", { kind: "title", title: "cfo" }).people[0].title).toBeNull();
    expect(takeSeat(s, "ann", { kind: "title", title: "President" }).people[0].title).toBe("CFO");
  });

  it("only takes a lead seat back from whoever holds it", () => {
    expect(takeSeat(base, "bob", { kind: "lead", ventureId: "ads" }).ventures[1].leadId).toBe("ann");
  });
});

describe("canGive", () => {
  it("explains why a promotion can't go to someone", () => {
    expect(canGive(base, "ann", { kind: "lead", ventureId: "ads" }, "Ann")).toEqual({ ok: false, error: "Ann already leads Ads." });
    expect(canGive(base, "bob", { kind: "lead", ventureId: "ads" })).toEqual({ ok: false, error: "Ads already has a lead." });
    expect(canGive(base, "ann", { kind: "title", title: "President" }, "Ann")).toEqual({
      ok: false,
      error: "Ann is already President.",
    });
    expect(canGive(base, "bob", { kind: "lead", ventureId: "gone" }).ok).toBe(false);
  });

  it("allows an open seat", () => {
    expect(canGive(base, "bob", { kind: "lead", ventureId: "web" })).toEqual({ ok: true });
    expect(canGive(base, "bob", { kind: "title", title: "CFO" })).toEqual({ ok: true });
  });
});

describe("parseNewPromotion", () => {
  it("tidies spaces", () => {
    expect(parseNewPromotion("  Head   of Marketing ", base)).toEqual({ ok: true, title: "Head of Marketing" });
  });

  it("rejects blanks, long ones and repeats", () => {
    expect(parseNewPromotion("   ", base).ok).toBe(false);
    expect(parseNewPromotion("x".repeat(61), base).ok).toBe(false);
    expect(parseNewPromotion("cfo", base)).toEqual({ ok: false, error: "cfo is already a promotion." });
  });

  it("rejects a venture's lead seat", () => {
    expect(parseNewPromotion("websites lead", base)).toEqual({
      ok: false,
      error: "Websites Lead comes from the Websites venture, so it's already handled.",
    });
  });
});

describe("helpers", () => {
  it("compares titles ignoring case and spaces", () => {
    expect(sameTitle(" sales  manager", "Sales Manager")).toBe(true);
    expect(sameTitle(null, "CFO")).toBe(false);
  });

  it("lists what someone leads", () => {
    expect(venturesLed(base.ventures, "ann").map((v) => v.name)).toEqual(["Ads"]);
  });
});
