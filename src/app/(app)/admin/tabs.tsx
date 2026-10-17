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
          aria-current={pathname === t.href ? "page" : undefined}
          className={`chip shrink-0 ${pathname === t.href ? "chip-active" : ""}`}
        >
          {t.label}
        </Link>
      ))}
      {/* A plain link: the browser downloads the CSV. */}
      <a href="/api/export" className="chip shrink-0 border-dashed sm:ml-auto">
        Export CSV
      </a>
    </nav>
  );
}
