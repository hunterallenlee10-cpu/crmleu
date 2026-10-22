import { daysBetween } from "./dates";

// Geometry for the Ventures map: ventures are spokes around the LEU core and
// each task is a dot on its venture's spoke. Dots sit in rings by how soon
// they're due, so work drifts toward LEU as its date gets closer. Finished
// tasks leave the map (they join the core).
//
// All numbers are SVG user units in a viewBox centred on the core.

export const MAP = {
  coreRadius: 58,
  innerRadius: 84, // inner edge of the "due now" ring
  outerRadius: 300, // tip of each spoke
  plusRadius: 320, // the admin's "add a task here" button
  labelRadius: 350,
  dotRadius: 7,
  gap: 18, // centre to centre between neighbouring dots
} as const;

// Leaves room for labels on every side.
export const VIEWBOX = { x: -580, y: -405, width: 1160, height: 810 } as const;

// Rings from the core out. A task with no due date waits at the tip.
export const BANDS = ["Due now", "This week", "This month", "Later", "No date"] as const;
export const BAND_WIDTH = (MAP.outerRadius - MAP.innerRadius) / BANDS.length;

export function bandStart(band: number) {
  return MAP.innerRadius + band * BAND_WIDTH;
}

// 0 = overdue or due today, 1 = within a week, 2 = within a month, 3 = later, 4 = no date.
export function dueBand(due: string | null, today: string) {
  if (!due) return 4;
  const days = daysBetween(today, due);
  if (days <= 0) return 0;
  if (days <= 7) return 1;
  if (days <= 30) return 2;
  return 3;
}

// 0 is straight up, then clockwise.
export function spokeAngle(index: number, count: number) {
  return ((-90 + (index * 360) / Math.max(count, 1)) * Math.PI) / 180;
}

export type DotInput = { id: string; spoke: number; due: string | null; done: boolean };
export type DotPosition = { x: number; y: number };
// Shown in place of the last dot when a ring on a spoke is too full.
export type Overflow = { key: string; spoke: number; band: number; x: number; y: number; count: number };

const ROWS_PER_BAND = Math.max(1, Math.floor(BAND_WIDTH / MAP.gap));
const MAX_PER_ROW = 5;

// How many dots fit side by side at radius r without crowding the next spoke.
function rowCapacity(r: number, spokeCount: number) {
  const arc = spokeCount > 1 ? (r * 2 * Math.PI) / spokeCount : Infinity;
  return Math.min(Math.max(Math.floor((arc * 0.8) / MAP.gap), 1), MAX_PER_ROW);
}

export function layoutDots(
  spokeCount: number,
  dots: DotInput[],
  today: string,
): { positions: Map<string, DotPosition>; overflow: Overflow[] } {
  const positions = new Map<string, DotPosition>();
  const overflow: Overflow[] = [];
  const bySpoke = new Map<number, DotInput[]>();
  for (const d of dots) {
    if (d.spoke < 0 || d.spoke >= spokeCount) continue;
    bySpoke.set(d.spoke, [...(bySpoke.get(d.spoke) ?? []), d]);
  }

  for (const [spoke, list] of bySpoke) {
    const a = spokeAngle(spoke, spokeCount);
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    // `off` is sideways, across the spoke.
    const at = (r: number, off: number) => ({ x: round(cos * r - sin * off), y: round(sin * r + cos * off) });
    const across = (k: number, n: number, gap: number) => (k - (n - 1) / 2) * gap;

    for (let band = 0; band < BANDS.length; band++) {
      const here = list
        .filter((d) => !d.done && dueBand(d.due, today) === band)
        .sort((p, q) => (p.due ?? "").localeCompare(q.due ?? "") || p.id.localeCompare(q.id));
      if (!here.length) continue;

      // Soonest due on the inner row. Rows fill evenly so a ring with a few
      // dots doesn't pile them all on one side.
      const rows = Array.from({ length: ROWS_PER_BAND }, (_, k) => {
        const r = bandStart(band) + (BAND_WIDTH * (k + 0.5)) / ROWS_PER_BAND;
        return { r, cap: rowCapacity(r, spokeCount) };
      });
      const capacity = rows.reduce((n, row) => n + row.cap, 0);
      const extra = here.length > capacity ? here.length - capacity + 1 : 0;
      const shown = here.slice(0, here.length - extra);
      const slots = shown.length + (extra ? 1 : 0);

      let next = 0;
      let left = slots;
      rows.forEach((row, k) => {
        const n = Math.min(row.cap, Math.ceil(left / (rows.length - k)));
        for (let i = 0; i < n; i++) {
          const p = at(row.r, across(i, n, MAP.gap));
          const d = shown[next];
          if (d) positions.set(d.id, p);
          else overflow.push({ key: `${spoke}-${band}`, spoke, band, ...p, count: extra });
          next++;
        }
        left -= n;
      });
    }
  }
  return { positions, overflow };
}

// A point at radius r along an angle. Rounded so the server and the browser
// draw exactly the same numbers (their trig can differ in the last digit).
export function polar(r: number, angle: number) {
  return { x: round(Math.cos(angle) * r), y: round(Math.sin(angle) * r) };
}

// Label text sizes in map units. On a phone the whole map is shrunk to about
// a third, so its labels are drawn bigger to stay readable.
export const LABEL_SIZES = {
  desktop: { name: 22, count: 15, ring: 13, maxChars: 22 },
  phone: { name: 34, count: 24, ring: 22, maxChars: 12 },
} as const;

// Where a spoke's name and count go: beside the tip on the left and right,
// above or below it at the top and bottom. Phone labels are bigger, so their
// lines sit further apart.
export function labelPlacement(angle: number, phone = false) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const { x, y } = polar(MAP.labelRadius, angle);
  const anchor: "start" | "end" | "middle" = cos > 0.3 ? "start" : cos < -0.3 ? "end" : "middle";
  const [name, count] =
    anchor === "middle"
      ? sin < 0
        ? phone ? [-26, -2] : [-20, -2]
        : phone ? [14, 40] : [14, 32]
      : phone ? [-6, 22] : [-4, 15];
  return { x, y, anchor, nameY: round(y + name), countY: round(y + count) };
}

// Long names would run off the edge of the map; the full name stays in the
// bubble and the panel.
export function shortLabel(name: string, max = 22) {
  return name.length > max ? `${name.slice(0, max - 1).trimEnd()}…` : name;
}

// Each person gets a steady colour, from tokens that are tuned for both themes.
export const PERSON_COLORS = 8;
export function personColor(index: number) {
  return index < 0 ? "var(--color-faint)" : `var(--color-person-${(index % PERSON_COLORS) + 1})`;
}

function round(n: number) {
  return Math.round(n * 10) / 10;
}
