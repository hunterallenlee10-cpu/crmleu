"use client";

import {
  CalendarCheck,
  KanbanSquare,
  ListChecks,
  SlidersHorizontal,
  SquarePlus,
  Users,
  type LucideIcon,
} from "lucide-react";
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

// Icons for the phone tab bar.
const ICONS: Record<string, LucideIcon> = {
  "/today": CalendarCheck,
  "/leads": Users,
  "/pipeline": KanbanSquare,
  "/tasks": ListChecks,
  "/leads/new": SquarePlus,
  "/admin": SlidersHorizontal,
};

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
    <nav className="hidden items-center gap-0.5 md:flex">
      {itemsFor(role).map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={isActive(pathname, item.href) ? "page" : undefined}
          className={`rounded-control px-3 py-1.5 text-sm font-medium transition-colors duration-150 ${
            isActive(pathname, item.href)
              ? "bg-accent/[0.12] text-accent"
              : "text-muted hover:bg-fg/[0.06] hover:text-fg"
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
      className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface-2 md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = ICONS[item.href];
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-medium transition-colors duration-150 ${
                  active ? "text-accent" : "text-muted active:text-fg"
                }`}
              >
                {Icon && (
                  <span
                    aria-hidden="true"
                    className={`flex h-7 w-11 items-center justify-center rounded-control transition-colors duration-150 ${active ? "bg-accent/[0.14]" : ""}`}
                  >
                    <Icon className="size-[18px]" strokeWidth={1.75} />
                  </span>
                )}
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
