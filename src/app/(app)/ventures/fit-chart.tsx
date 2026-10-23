"use client";

import { useEffect, useRef, type ReactNode } from "react";

// The org chart's card. If the chart is too wide for it, rows of people with
// no one under them wrap into a grid (see .org-leaves) instead of scrolling.
export function FitChart({ className, children }: { className: string; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      // Measure unwrapped, then wrap only if that overflows. Runs before
      // paint, so there's no flicker.
      delete el.dataset.wrap;
      if (el.scrollWidth > el.clientWidth + 1) el.dataset.wrap = "";
    };
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section ref={ref} className={`org-fit ${className}`}>
      {children}
    </section>
  );
}
