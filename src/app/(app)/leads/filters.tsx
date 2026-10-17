"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { STAGES } from "@/lib/types";

export type FilterOption = { value: string; label: string };

// Search box + dropdown filters. They live in the URL so the list is
// shareable and the back button works.
export function LeadFilters({
  niches,
  owners,
}: {
  niches: string[];
  owners?: FilterOption[]; // admin only
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [filters, setFilters] = useState({
    q: params.get("q") ?? "",
    stage: params.get("stage") ?? "",
    niche: params.get("niche") ?? "",
    owner: params.get("owner") ?? "",
  });
  const first = useRef(true);

  // Push filter changes to the URL (search waits for a pause in typing).
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => {
      const next = new URLSearchParams();
      for (const [k, v] of Object.entries(filters)) if (v.trim()) next.set(k, v.trim());
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, 300);
    return () => clearTimeout(t);
  }, [filters, pathname, router]);

  const set = (name: keyof typeof filters) => (e: { target: { value: string } }) =>
    setFilters((f) => ({ ...f, [name]: e.target.value }));

  return (
    <div className="space-y-3 rounded-2xl border border-line bg-panel/60 p-3 shadow-[inset_0_1px_0_rgb(255_255_255/0.03)]">
      <input
        type="search"
        value={filters.q}
        onChange={set("q")}
        placeholder="Search business, contact, phone, city"
        aria-label="Search leads"
        className="input"
      />
      <div className={`grid gap-3 sm:flex ${owners ? "grid-cols-3" : "grid-cols-2"}`}>
        <select aria-label="Stage" className="input sm:w-48" value={filters.stage} onChange={set("stage")}>
          <option value="">All stages</option>
          {STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select aria-label="Niche" className="input sm:w-48" value={filters.niche} onChange={set("niche")}>
          <option value="">All niches</option>
          {niches.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        {owners && (
          <select aria-label="Owner" className="input sm:w-48" value={filters.owner} onChange={set("owner")}>
            <option value="">All owners</option>
            {owners.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        )}
      </div>
    </div>
  );
}
