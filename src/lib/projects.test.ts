import { describe, expect, it } from "vitest";
import { parseChecklist, parseProjectForm, progress } from "./projects";

describe("parseChecklist", () => {
  it("makes one item per line and drops blanks", () => {
    expect(parseChecklist("Get logo\n\n  Write copy  \r\nLaunch\n")).toEqual([
      "Get logo",
      "Write copy",
      "Launch",
    ]);
  });

  it("strips bullets, numbers and checkboxes", () => {
    expect(parseChecklist("- one\n* two\n• three\n1. four\n2) five\n[ ] six\n- [x] seven")).toEqual([
      "one",
      "two",
      "three",
      "four",
      "five",
      "six",
      "seven",
    ]);
  });

  it("keeps numbers that are part of the item", () => {
    expect(parseChecklist("3 pages of copy\n10x10 banner")).toEqual(["3 pages of copy", "10x10 banner"]);
  });
});

describe("parseProjectForm", () => {
  const form = (fields: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    return fd;
  };

  it("turns blanks into nulls", () => {
    expect(parseProjectForm(form({ name: " Site ", description: "", assignee_id: "", due_date: "" }))).toEqual({
      ok: true,
      data: { name: "Site", description: null, assignee_id: null, due_date: null },
    });
  });

  it("needs a name and a real date", () => {
    expect(parseProjectForm(form({ name: "  " }))).toMatchObject({ ok: false });
    expect(parseProjectForm(form({ name: "Site", due_date: "next week" }))).toEqual({
      ok: false,
      error: "Pick a valid due date.",
    });
  });
});

describe("progress", () => {
  it("counts done items, and an empty checklist isn't complete", () => {
    expect(progress([{ done: true }, { done: false }])).toEqual({ done: 1, total: 2, complete: false });
    expect(progress([{ done: true }])).toEqual({ done: 1, total: 1, complete: true });
    expect(progress([])).toEqual({ done: 0, total: 0, complete: false });
  });
});
