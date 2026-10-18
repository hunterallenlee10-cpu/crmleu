import Link from "next/link";
import { FollowUpBadge, StageBadge } from "@/components/badges";
import type { Lead } from "@/lib/types";

// One lead in a list. The whole row is a big tap target.
// `inList` renders a divided row inside a shared panel instead of its own card.
export function LeadRow({ lead, today, inList = false }: { lead: Lead; today: string; inList?: boolean }) {
  return (
    <Link
      href={`/leads/${lead.id}`}
      className={
        inList
          ? "block px-4 py-3.5 transition-colors duration-150 hover:bg-surface-2 focus-visible:-outline-offset-2 sm:px-5"
          : "card card-link block px-4 py-3.5 sm:px-5"
      }
    >
      <LeadRowBody lead={lead} today={today} />
    </Link>
  );
}

export function LeadRowBody({ lead, today, owner }: { lead: Lead; today: string; owner?: string }) {
  const place = [lead.city, lead.state].filter(Boolean).join(", ");
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="truncate font-medium" title={lead.business_name}>{lead.business_name}</p>
        <p className="mt-0.5 truncate text-label text-muted">
          {[lead.contact_name, place, lead.niche].filter(Boolean).join(" · ") || " "}
        </p>
        {owner && <p className="mt-1 text-xs text-muted">{owner}</p>}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <StageBadge stage={lead.stage} />
        <FollowUpBadge date={lead.next_follow_up} today={today} />
      </div>
    </div>
  );
}
