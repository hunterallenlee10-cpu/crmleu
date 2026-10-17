"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { THEME_COLORS, THEME_COOKIE, type Theme } from "@/lib/theme-shared";

// The theme lives on <html data-theme>, so every toggle on the page stays in sync.
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}
const readTheme = (): Theme => (document.documentElement.dataset.theme === "light" ? "light" : "dark");

// Sun / moon button that flips between the dark and light themes.
// The choice is saved in a cookie so the server renders the right theme next time.
export function ThemeToggle({ initial = "dark", className = "" }: { initial?: Theme; className?: string }) {
  const theme = useSyncExternalStore(subscribe, readTheme, () => initial);
  const next: Theme = theme === "dark" ? "light" : "dark";

  function toggle() {
    document.documentElement.dataset.theme = next;
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLORS[next]);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      className={`inline-flex size-11 shrink-0 items-center justify-center rounded-control text-muted transition-colors duration-150 hover:bg-fg/[0.06] hover:text-fg sm:size-9 ${className}`}
    >
      {/* Sun shows in dark mode (tap for light); moon shows in light mode. */}
      {theme === "dark" ? (
        <Sun aria-hidden="true" className="size-[18px]" strokeWidth={1.75} />
      ) : (
        <Moon aria-hidden="true" className="size-[18px]" strokeWidth={1.75} />
      )}
    </button>
  );
}
