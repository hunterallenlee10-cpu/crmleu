// Geometry for the Projects map: divisions are spokes around the LEU core,
// and each project is a dot that travels from the tip of its spoke toward
// the core as its checklist gets done. Finished projects sit inside the core.
//
// All numbers are SVG user units in a viewBox centred on the core.

export const MAP = {
  coreRadius: 58,
  innerRadius: 84, // a project at 100% would sit here, just outside the core
  outerRadius: 300, // a project at 0% sits at the tip of its spoke
  plusRadius: 320, // the admin's "add a project here" button
  labelRadius: 342,
  dotRadius: 8,
  doneDotRadius: 3.5,
} as const;

// Leaves room for labels on every side.
export const VIEWBOX = { x: -580, y: -405, width: 1160, height: 810 } as const;

// 0 is straight up, then clockwise.
export function spokeAngle(index: number, count: number) {
  return ((-90 + (index * 360) / Math.max(count, 1)) * Math.PI) / 180;
}

export function fraction(done: number, total: number) {
  return total > 0 ? Math.min(Math.max(done / total, 0), 1) : 0;
}

export function radiusFor(f: number) {
  return MAP.outerRadius - Math.min(Math.max(f, 0), 1) * (MAP.outerRadius - MAP.innerRadius);
}

export type DotInput = { id: string; spoke: number; done: number; total: number };
export type DotPosition = { x: number; y: number; complete: boolean };

// Dots closer than this (in checklist fraction) on the same spoke would
// overlap, so they're fanned out side by side instead.
const ACTIVE_GAP = 19;
const DONE_GAP = 9;
const CLUSTER_FRACTION = ACTIVE_GAP / (MAP.outerRadius - MAP.innerRadius);

export function layoutDots(spokeCount: number, dots: DotInput[]): Map<string, DotPosition> {
  const out = new Map<string, DotPosition>();
  const bySpoke = new Map<number, DotInput[]>();
  for (const d of dots) {
    if (d.spoke < 0 || d.spoke >= spokeCount) continue;
    bySpoke.set(d.spoke, [...(bySpoke.get(d.spoke) ?? []), d]);
  }

  for (const [spoke, list] of bySpoke) {
    const a = spokeAngle(spoke, spokeCount);
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const place = (cluster: DotInput[], radius: (d: DotInput) => number, gap: number, complete: boolean) => {
      cluster.forEach((d, k) => {
        const off = (k - (cluster.length - 1) / 2) * gap; // sideways, across the spoke
        const r = radius(d);
        out.set(d.id, { x: round(cos * r - sin * off), y: round(sin * r + cos * off), complete });
      });
    };

    const isComplete = (d: DotInput) => d.total > 0 && d.done >= d.total;
    const active = list
      .filter((d) => !isComplete(d))
      .sort((p, q) => fraction(p.done, p.total) - fraction(q.done, q.total) || p.id.localeCompare(q.id));
    let cluster: DotInput[] = [];
    for (const d of active) {
      const last = cluster[cluster.length - 1];
      if (last && fraction(d.done, d.total) - fraction(last.done, last.total) > CLUSTER_FRACTION) {
        place(cluster, (x) => radiusFor(fraction(x.done, x.total)), ACTIVE_GAP, false);
        cluster = [];
      }
      cluster.push(d);
    }
    place(cluster, (x) => radiusFor(fraction(x.done, x.total)), ACTIVE_GAP, false);

    const complete = list.filter(isComplete).sort((p, q) => p.id.localeCompare(q.id));
    place(complete, () => MAP.coreRadius - 11, DONE_GAP, true);
  }
  return out;
}

// Where a spoke's name and count go: beside the tip on the left and right,
// above or below it at the top and bottom.
export function labelPlacement(angle: number) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const x = cos * MAP.labelRadius;
  const y = sin * MAP.labelRadius;
  const anchor: "start" | "end" | "middle" = cos > 0.3 ? "start" : cos < -0.3 ? "end" : "middle";
  if (anchor === "middle") {
    return sin < 0
      ? { x, anchor, nameY: y - 20, countY: y - 2 }
      : { x, anchor, nameY: y + 14, countY: y + 32 };
  }
  return { x, anchor, nameY: y - 4, countY: y + 15 };
}

// Long names would run off the edge of the map; the full name stays in the
// tooltip and the panel.
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
