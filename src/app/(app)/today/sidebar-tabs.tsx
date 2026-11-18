"use client";

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";

type Tab = "feed" | "news";

// The Today sidebar: the team feed and announcements, one at a time.
// Opens on the feed; a dot on Announcements flags a fresh post.
export function SidebarTabs({
  feed,
  news,
  newsCount,
  freshNews,
}: {
  feed: ReactNode;
  news: ReactNode;
  newsCount: number;
  freshNews: boolean;
}) {
  const [tab, setTab] = useState<Tab>("feed");
  const refs = useRef<Record<Tab, HTMLButtonElement | null>>({ feed: null, news: null });

  const tabs: { id: Tab; label: string; badge?: ReactNode }[] = [
    { id: "feed", label: "Team feed" },
    {
      id: "news",
      label: "Announcements",
      badge: freshNews ? (
        <>
          <span aria-hidden="true" className="size-2 rounded-full bg-accent" />
          <span className="sr-only">(new)</span>
        </>
      ) : newsCount > 0 ? (
        <span className="count">{newsCount}</span>
      ) : null,
    },
  ];

  function onKeyDown(e: KeyboardEvent) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const next: Tab = tab === "feed" ? "news" : "feed";
    setTab(next);
    refs.current[next]?.focus();
  }

  return (
    <section className="space-y-4">
      <div role="tablist" aria-label="Team" className="grid grid-cols-2 gap-2" onKeyDown={onKeyDown}>
        {tabs.map((t) => (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[t.id] = el;
            }}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => setTab(t.id)}
            className={`chip gap-2 ${tab === t.id ? "chip-active" : ""}`}
          >
            {t.label}
            {t.badge}
          </button>
        ))}
      </div>
      <div role="tabpanel" id="panel-feed" aria-labelledby="tab-feed" hidden={tab !== "feed"}>
        {feed}
      </div>
      <div role="tabpanel" id="panel-news" aria-labelledby="tab-news" hidden={tab !== "news"}>
        {news}
      </div>
    </section>
  );
}
