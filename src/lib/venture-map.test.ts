import { describe, expect, it } from "vitest";
import {
  BAND_WIDTH,
  MAP,
  bandStart,
  dueBand,
  labelPlacement,
  layoutDots,
  personColor,
  shortLabel,
  spokeAngle,
} from "./venture-map";

const TODAY = "2026-10-22";
const dist = (p: { x: number; y: number }) => Math.hypot(p.x, p.y);
const bandOf = (p: { x: number; y: number }) => Math.floor((dist(p) - MAP.innerRadius) / BAND_WIDTH);

describe("spokeAngle", () => {
  it("starts at the top and goes clockwise", () => {
    expect(spokeAngle(0, 12)).toBeCloseTo(-Math.PI / 2);
    expect(spokeAngle(3, 12)).toBeCloseTo(0); // 3 o'clock
    expect(spokeAngle(6, 12)).toBeCloseTo(Math.PI / 2); // 6 o'clock
  });
});

describe("dueBand", () => {
  it("puts overdue and due-today tasks closest to the core", () => {
    expect(dueBand("2026-10-01", TODAY)).toBe(0);
    expect(dueBand(TODAY, TODAY)).toBe(0);
  });
  it("then this week, this month and later", () => {
    expect(dueBand("2026-10-23", TODAY)).toBe(1);
    expect(dueBand("2026-10-29", TODAY)).toBe(1);
    expect(dueBand("2026-10-30", TODAY)).toBe(2);
    expect(dueBand("2026-11-21", TODAY)).toBe(2);
    expect(dueBand("2026-11-22", TODAY)).toBe(3);
  });
  it("leaves undated tasks at the tip", () => {
    expect(dueBand(null, TODAY)).toBe(4);
  });
});

describe("layoutDots", () => {
  it("places each task in the ring for its due date, on its spoke", () => {
    const { positions } = layoutDots(
      4,
      [
        { id: "now", spoke: 1, due: "2026-10-20", done: false },
        { id: "later", spoke: 1, due: "2027-03-01", done: false },
        { id: "undated", spoke: 1, due: null, done: false },
      ],
      TODAY,
    );
    expect(bandOf(positions.get("now")!)).toBe(0);
    expect(bandOf(positions.get("later")!)).toBe(3);
    expect(bandOf(positions.get("undated")!)).toBe(4);
    expect(dist(positions.get("undated")!)).toBeLessThanOrEqual(MAP.outerRadius);
    // Spoke 1 of 4 points right; a lone dot sits on the spoke itself.
    expect(positions.get("now")!.x).toBeGreaterThan(0);
    expect(Math.abs(positions.get("now")!.y)).toBeLessThan(0.5);
  });

  it("spreads tasks in the same ring so they don't overlap", () => {
    const dots = ["a", "b", "c", "d"].map((id) => ({ id, spoke: 0, due: null, done: false }));
    const { positions, overflow } = layoutDots(4, dots, TODAY);
    expect(overflow).toEqual([]);
    const pts = [...positions.values()];
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        expect(Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y)).toBeGreaterThanOrEqual(MAP.dotRadius * 2);
      }
      expect(bandOf(pts[i])).toBe(4);
    }
  });

  it("puts the soonest-due task on the inner row of a ring", () => {
    const { positions } = layoutDots(
      12,
      [
        { id: "late", spoke: 0, due: "2026-11-20", done: false },
        { id: "soon", spoke: 0, due: "2026-10-31", done: false },
        { id: "mid", spoke: 0, due: "2026-11-10", done: false },
      ],
      TODAY,
    );
    expect(dist(positions.get("soon")!)).toBeLessThan(dist(positions.get("late")!));
  });

  it("shows a +N marker when a ring is too full", () => {
    const dots = Array.from({ length: 30 }, (_, i) => ({ id: `t${i}`, spoke: 0, due: TODAY, done: false }));
    const { positions, overflow } = layoutDots(12, dots, TODAY);
    expect(overflow).toHaveLength(1);
    expect(positions.size + overflow[0].count).toBe(30);
    expect(bandOf(overflow[0])).toBe(0);
  });

  it("puts finished tasks inside the core, a few per spoke", () => {
    const dots = Array.from({ length: 5 }, (_, i) => ({ id: `d${i}`, spoke: 2, due: null, done: true }));
    const { positions } = layoutDots(3, dots, TODAY);
    expect(positions.size).toBe(3);
    // The last ones listed (most recently finished) are the ones shown.
    expect(positions.has("d4")).toBe(true);
    expect(positions.has("d0")).toBe(false);
    for (const p of positions.values()) {
      expect(p.done).toBe(true);
      expect(dist(p)).toBeLessThan(MAP.coreRadius);
    }
  });

  it("skips dots on a spoke that doesn't exist", () => {
    const { positions } = layoutDots(2, [{ id: "a", spoke: 5, due: null, done: false }], TODAY);
    expect(positions.size).toBe(0);
  });
});

describe("bandStart", () => {
  it("runs from just outside the core to the tip", () => {
    expect(bandStart(0)).toBe(MAP.innerRadius);
    expect(bandStart(5)).toBeCloseTo(MAP.outerRadius);
  });
});

describe("labelPlacement", () => {
  it("anchors labels away from the core", () => {
    expect(labelPlacement(spokeAngle(3, 12)).anchor).toBe("start");
    expect(labelPlacement(spokeAngle(9, 12)).anchor).toBe("end");
    expect(labelPlacement(spokeAngle(0, 12)).anchor).toBe("middle");
  });
});

describe("shortLabel", () => {
  it("shortens long names with an ellipsis", () => {
    expect(shortLabel("Websites")).toBe("Websites");
    expect(shortLabel("A really long venture name here", 12)).toBe("A really lo…");
  });
});

describe("personColor", () => {
  it("cycles through the person colours and greys out nobody", () => {
    expect(personColor(0)).toBe("var(--color-person-1)");
    expect(personColor(8)).toBe("var(--color-person-1)");
    expect(personColor(-1)).toBe("var(--color-faint)");
  });
});
