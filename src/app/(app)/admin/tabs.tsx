"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/team", label: "Team" },
  { href: "/admin/import", label: "Import" },
];

export function AdminTabs() {
  const pathname = usePathname();
  return (
    <nav className="-mx-5 flex gap-2 overflow-x-auto px-5" aria-label="Admin">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={`shrink-0 rounded-full border px-4 py-2.5 text-sm font-medium ${
            pathname === t.href ? "border-gold bg-gold text-black" : "border-line text-muted hover:text-fg"
          }`}
        >
          {t.label}
        </Link>
      ))}
      {/* A plain link: the browser downloads the CSV. */}
      <a href="/api/export" className="shrink-0 rounded-full border border-line px-4 py-2.5 text-sm font-medium text-muted hover:text-fg">
        Export CSV
      </a>
    </nav>
  );
}
