import { describe, expect, it } from "vitest";
import { guessMapping, parseDate, parseMoney, parseServiceInterest, parseStage, parseYes } from "./import-fields";

describe("guessMapping", () => {
  it("matches common Google Sheet headers", () => {
    expect(
      guessMapping(["Business Name", "Owner Name", "Phone #", "E-mail", "City", "Status", "Notes", "Random"]),
    ).toEqual({
      business_name: "Business Name",
      contact_name: "Owner Name",
      phone: "Phone #",
      email: "E-mail",
      city: "City",
      stage: "Status",
      notes: "Notes",
    });
  });
});

describe("parseStage", () => {
  it.each([
    ["Warm Up Program", "warm_up_program"],
    ["quote_given", "quote_given"],
    ["Warm up", "warm_up_program"],
    ["Quoted", "quote_given"],
    ["Spec Sent", "warm_up_program"],
    ["Proposal Sent", "quote_given"],
    ["Closed Won", "won"],
    ["dead", "lost"],
    ["", null],
    ["Maybe later", null],
  ])("%s -> %s", (input, expected) => expect(parseStage(input)).toBe(expected));
});

describe("parseDate", () => {
  it.each([
    ["2026-10-14", "2026-10-14"],
    ["10/14/2026", "2026-10-14"],
    ["1/5/26", "2026-01-05"],
    ["2/30/2026", null],
    ["next week", null],
    ["", null],
  ])("%s -> %s", (input, expected) => expect(parseDate(input)).toBe(expected));
});

describe("other parsers", () => {
  it("parses money", () => {
    expect(parseMoney("$2,500.00")).toBe(2500);
    expect(parseMoney("lots")).toBeNull();
  });
  it("parses yes/no", () => {
    expect(parseYes("Yes")).toBe(true);
    expect(parseYes("x")).toBe(true);
    expect(parseYes("no")).toBe(false);
    expect(parseYes("")).toBe(false);
  });
  it("parses service interest", () => {
    expect(parseServiceInterest("Website")).toBe("website");
    expect(parseServiceInterest("AI receptionist / call answering")).toBe("ai_call_answering");
    expect(parseServiceInterest("website + automation")).toBe("multiple");
    expect(parseServiceInterest("")).toBeNull();
  });
});
