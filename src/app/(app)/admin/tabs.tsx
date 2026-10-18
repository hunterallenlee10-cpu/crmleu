"use client";

import { Download } from "lucide-react";
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
    <nav className="-mx-5 flex gap-2 overflow-x-auto border-b border-line px-5 pb-4" aria-label="Admin">
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
      <a href="/api/export" className="btn btn-secondary shrink-0 sm:ml-auto">
        <Download aria-hidden="true" className="size-4 text-muted" strokeWidth={1.75} />
        Export CSV
      </a>
    </nav>
  );
}
