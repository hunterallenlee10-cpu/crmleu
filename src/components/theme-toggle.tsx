"use client";

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
      className={`relative inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-line bg-panel/70 text-muted shadow-[inset_0_1px_0_rgb(255_255_255/0.04)] transition-[color,border-color,transform] duration-200 hover:border-gold/50 hover:text-gold-light active:scale-95 ${className}`}
    >
      {/* Sun shows in dark mode (tap for light); moon shows in light mode. */}
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        className={`absolute size-[18px] transition-[opacity,transform] duration-300 ${theme === "dark" ? "rotate-0 opacity-100" : "-rotate-90 opacity-0"}`}
      >
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
      </svg>
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`absolute size-[18px] transition-[opacity,transform] duration-300 ${theme === "light" ? "rotate-0 opacity-100" : "rotate-90 opacity-0"}`}
      >
        <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z" />
      </svg>
    </button>
  );
}
