import { describe, expect, it } from "vitest";
import { addDays, followUpLabel, todayNY } from "./dates";

describe("todayNY", () => {
  it("uses New York time, not UTC", () => {
    // 2026-10-10 02:00 UTC is still Oct 9 in New York
    expect(todayNY(new Date("2026-10-10T02:00:00Z"))).toBe("2026-10-09");
    expect(todayNY(new Date("2026-10-10T16:00:00Z"))).toBe("2026-10-10");
  });
});

describe("addDays", () => {
  it("crosses months and DST", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-11-01", 7)).toBe("2026-11-08");
  });
});

describe("followUpLabel", () => {
  it("labels relative to today", () => {
    expect(followUpLabel("2026-10-07", "2026-10-10")).toEqual({ text: "Overdue 3d", tone: "overdue" });
    expect(followUpLabel("2026-10-10", "2026-10-10").text).toBe("Today");
    expect(followUpLabel("2026-10-11", "2026-10-10").text).toBe("Tomorrow");
    expect(followUpLabel("2026-10-20", "2026-10-10").text).toBe("Oct 20");
  });
});
