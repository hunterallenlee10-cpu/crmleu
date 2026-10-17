"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@/lib/types";

type NavItem = { href: string; label: string };

const REP_ITEMS: NavItem[] = [
  { href: "/today", label: "Today" },
  { href: "/leads", label: "Leads" },
  { href: "/pipeline", label: "Pipeline" },
  { href: "/tasks", label: "Tasks" },
  { href: "/leads/new", label: "+ New" },
];
const ADMIN_ITEMS: NavItem[] = [{ href: "/admin", label: "Admin" }];

function itemsFor(role: Role) {
  return role === "admin" ? [...REP_ITEMS, ...ADMIN_ITEMS] : REP_ITEMS;
}

function isActive(pathname: string, href: string) {
  if (href === "/leads") return pathname.startsWith("/leads") && pathname !== "/leads/new";
  return pathname.startsWith(href);
}

// Inline links in the header on desktop.
export function DesktopNav({ role }: { role: Role }) {
  const pathname = usePathname();
  return (
    <nav className="hidden items-center gap-1 rounded-full border border-line bg-panel/70 p-1 shadow-[inset_0_1px_0_rgb(255_255_255/0.04)] md:flex">
      {itemsFor(role).map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={isActive(pathname, item.href) ? "page" : undefined}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
            isActive(pathname, item.href)
              ? "bg-gold/[0.12] text-gold-light shadow-[inset_0_0_0_1px_rgb(201_162_74/0.3)]"
              : "text-muted hover:bg-white/[0.04] hover:text-fg"
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
      className="fixed inset-x-0 bottom-0 z-20 border-t border-white/[0.06] bg-ink/85 backdrop-blur-xl backdrop-saturate-150 md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex min-h-16 items-center justify-center font-medium transition-colors ${items.length > 5 ? "text-xs min-[400px]:text-sm" : "text-sm"} ${
                  active ? "text-gold-light" : "text-muted active:text-fg"
                }`}
              >
                {/* Gold bar above the current tab */}
                <span
                  aria-hidden="true"
                  className={`absolute top-0 left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full bg-gold transition-opacity ${
                    active ? "opacity-100 shadow-[0_0_12px_rgb(201_162_74/0.8)]" : "opacity-0"
                  }`}
                />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
