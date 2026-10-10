import { describe, expect, it } from "vitest";
import { formatPhone, normalizeBusinessName, normalizeCity, normalizePhone } from "./normalize";

// Same cases as supabase/tests/lead_rules.test.sql, so the two stay in sync.
describe("normalizePhone", () => {
  it.each([
    ["+1 (301) 555-0100", "3015550100"],
    ["301.555.0100", "3015550100"],
    ["13015550100", "3015550100"],
    ["555-0100", null],
    ["", null],
    [null, null],
    ["23015550100", null],
  ])("%s -> %s", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });
});

describe("normalizeBusinessName", () => {
  it.each([
    ["  Joe's Pizza, L.L.C. ", "joes pizza"],
    ["Smith & Sons Co. Inc", "smith and sons"],
    ["Costco", "costco"],
    ["JOES PIZZA", "joes pizza"],
    ["Smith-Jones Roofing", "smith jones roofing"],
    ["A/C Pros LTD", "a c pros"],
  ])("%s -> %s", (input, expected) => {
    expect(normalizeBusinessName(input)).toBe(expected);
  });
});

describe("normalizeCity", () => {
  it("lowercases and trims", () => {
    expect(normalizeCity("  New   Market ")).toBe("new market");
    expect(normalizeCity(null)).toBe("");
  });
});

describe("formatPhone", () => {
  it("formats 10 digits", () => {
    expect(formatPhone("3015550100")).toBe("(301) 555-0100");
  });
});
