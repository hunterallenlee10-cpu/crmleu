"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export type PersonChip = { value: string; label: string; color: string; count: number };

// Filters and the Map / List switch live in the URL, like the lead filters.
function useSetParam() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
}

// Admin only. Picking a person fades everyone else's dots on the map and
// narrows the list.
export function PersonChips({ value, people, total }: { value: string; people: PersonChip[]; total: number }) {
  const setParam = useSetParam();
  const chip = (v: string, label: string, count: number, color?: string) => {
    const active = value === v;
    return (
      <button
        key={v || "everyone"}
        type="button"
        aria-pressed={active}
        onClick={() => setParam("person", active ? "" : v)}
        className={`chip gap-2 ${active ? "chip-active" : ""}`}
      >
        {color && <span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: color }} />}
        {label}
        <span className="text-xs text-faint">{count}</span>
      </button>
    );
  };
  return (
    <div role="group" aria-label="Show projects for" className="flex min-w-0 flex-wrap gap-2">
      {chip("", "Everyone", total)}
      {people.map((p) => chip(p.value, p.label, p.count, p.color))}
    </div>
  );
}

// The map needs room, so phones always get the list and don't see this switch.
export function ViewSwitch({ value }: { value: "map" | "list" }) {
  const setParam = useSetParam();
  return (
    <div role="group" aria-label="View" className="hidden gap-1 rounded-control border border-line bg-surface p-1 md:inline-flex">
      {(["map", "list"] as const).map((v) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          onClick={() => setParam("view", v === "map" ? "" : v)}
          className={`min-h-8 rounded-control px-3 text-label font-medium capitalize transition-colors ${
            value === v ? "bg-surface-2 text-fg shadow-[inset_0_0_0_1px_var(--color-line-strong)]" : "text-muted hover:text-fg"
          }`}
        >
          {v}
        </button>
      ))}
    </div>
  );
}
