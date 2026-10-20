import { describe, expect, it } from "vitest";
import { MAP, labelPlacement, layoutDots, personColor, radiusFor, shortLabel, spokeAngle } from "./project-map";

const dist = (p: { x: number; y: number }) => Math.hypot(p.x, p.y);

describe("spokeAngle", () => {
  it("starts at the top and goes clockwise", () => {
    expect(spokeAngle(0, 12)).toBeCloseTo(-Math.PI / 2);
    expect(spokeAngle(3, 12)).toBeCloseTo(0); // 3 o'clock
    expect(spokeAngle(6, 12)).toBeCloseTo(Math.PI / 2); // 6 o'clock
  });
});

describe("radiusFor", () => {
  it("puts a new project at the tip and a nearly done one by the core", () => {
    expect(radiusFor(0)).toBe(MAP.outerRadius);
    expect(radiusFor(1)).toBe(MAP.innerRadius);
    expect(radiusFor(0.5)).toBe((MAP.outerRadius + MAP.innerRadius) / 2);
    expect(radiusFor(7)).toBe(MAP.innerRadius);
  });
});

describe("layoutDots", () => {
  it("moves a dot inward as its checklist gets done", () => {
    const pos = layoutDots(4, [
      { id: "a", spoke: 1, done: 0, total: 4 },
      { id: "b", spoke: 1, done: 3, total: 4 },
    ]);
    expect(dist(pos.get("a")!)).toBeCloseTo(radiusFor(0));
    expect(dist(pos.get("b")!)).toBeCloseTo(radiusFor(0.75));
    // Spoke 1 of 4 points right.
    expect(pos.get("a")!.x).toBeGreaterThan(0);
    expect(Math.abs(pos.get("a")!.y)).toBeLessThan(0.5);
  });

  it("fans out dots that would overlap, evenly on both sides of the spoke", () => {
    const pos = layoutDots(4, [
      { id: "a", spoke: 0, done: 0, total: 5 },
      { id: "b", spoke: 0, done: 0, total: 3 },
    ]);
    const a = pos.get("a")!;
    const b = pos.get("b")!;
    expect(a.x).toBeCloseTo(-b.x);
    expect(Math.abs(a.x - b.x)).toBeGreaterThanOrEqual(MAP.dotRadius * 2);
    expect(a.y).toBeCloseTo(b.y);
  });

  it("puts finished projects inside the core", () => {
    const pos = layoutDots(3, [{ id: "a", spoke: 2, done: 3, total: 3 }]);
    expect(pos.get("a")!.complete).toBe(true);
    expect(dist(pos.get("a")!)).toBeLessThan(MAP.coreRadius);
  });

  it("treats an empty checklist as just started, not finished", () => {
    const pos = layoutDots(3, [{ id: "a", spoke: 0, done: 0, total: 0 }]);
    expect(pos.get("a")!.complete).toBe(false);
    expect(dist(pos.get("a")!)).toBeCloseTo(MAP.outerRadius);
  });

  it("skips dots on a spoke that doesn't exist", () => {
    expect(layoutDots(2, [{ id: "a", spoke: 5, done: 0, total: 1 }]).size).toBe(0);
  });
});

describe("labelPlacement", () => {
  it("anchors labels away from the core", () => {
    expect(labelPlacement(spokeAngle(0, 4)).anchor).toBe("middle");
    expect(labelPlacement(spokeAngle(1, 4)).anchor).toBe("start");
    expect(labelPlacement(spokeAngle(3, 4)).anchor).toBe("end");
    const top = labelPlacement(spokeAngle(0, 4));
    expect(top.nameY).toBeLessThan(top.countY);
    expect(top.countY).toBeLessThan(-MAP.outerRadius);
  });
});

describe("shortLabel and personColor", () => {
  it("shortens long names", () => {
    expect(shortLabel("Websites")).toBe("Websites");
    expect(shortLabel("A very long division name here")).toBe("A very long division…");
    expect(shortLabel("Abcdefghijklmnopqrstuvwxyz").length).toBe(22);
  });

  it("cycles through the person colours", () => {
    expect(personColor(0)).toBe("var(--color-person-1)");
    expect(personColor(8)).toBe("var(--color-person-1)");
    expect(personColor(-1)).toBe("var(--color-faint)");
  });
});
