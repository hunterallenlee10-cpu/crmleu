"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@/lib/types";

type NavItem = { href: string; label: string };

const REP_ITEMS: NavItem[] = [{ href: "/", label: "Home" }];
const ADMIN_ITEMS: NavItem[] = [{ href: "/admin/team", label: "Team" }];

function itemsFor(role: Role) {
  return role === "admin" ? [...REP_ITEMS, ...ADMIN_ITEMS] : REP_ITEMS;
}

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

// Inline links in the header on desktop.
export function DesktopNav({ role }: { role: Role }) {
  const pathname = usePathname();
  return (
    <nav className="hidden items-center gap-1 md:flex">
      {itemsFor(role).map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`rounded-lg px-3 py-2 text-sm font-medium ${
            isActive(pathname, item.href) ? "text-gold" : "text-muted hover:text-fg"
          }`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

// Big thumb-friendly tab bar pinned to the bottom on phones.
export function MobileNav({ role }: { role: Role }) {
  const pathname = usePathname();
  const items = itemsFor(role);
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-ink/95 backdrop-blur md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className={`flex min-h-16 items-center justify-center text-sm font-medium ${
                isActive(pathname, item.href) ? "text-gold" : "text-muted"
              }`}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
