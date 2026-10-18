"use client";

import { usePathname, useRouter } from "next/navigation";

// Admin only: show one person's projects. Lives in the URL like the lead filters.
export function PersonFilter({ value, people }: { value: string; people: { value: string; label: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  return (
    <select
      aria-label="Show projects for"
      className="input sm:w-64"
      value={value}
      onChange={(e) => {
        const v = e.target.value;
        router.replace(v ? `${pathname}?person=${encodeURIComponent(v)}` : pathname, { scroll: false });
      }}
    >
      <option value="">Everyone</option>
      <option value="unassigned">Unassigned</option>
      {people.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
    </select>
  );
}
