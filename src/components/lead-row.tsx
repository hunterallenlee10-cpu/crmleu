import Link from "next/link";
import { FollowUpBadge, StageBadge } from "@/components/badges";
import type { Lead } from "@/lib/types";

// One lead in a list. The whole card is a big tap target.
export function LeadRow({ lead, today, owner }: { lead: Lead; today: string; owner?: string }) {
  const place = [lead.city, lead.state].filter(Boolean).join(", ");
  return (
    <Link
      href={`/leads/${lead.id}`}
      className="card flex items-start justify-between gap-4 transition-colors hover:border-gold/60"
    >
      <div className="min-w-0">
        <p className="truncate font-medium">{lead.business_name}</p>
        <p className="truncate text-sm text-muted">
          {[lead.contact_name, place, lead.niche].filter(Boolean).join(" · ") || " "}
        </p>
        {owner && <p className="mt-1 text-xs text-muted/80">{owner}</p>}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">
        <StageBadge stage={lead.stage} />
        <FollowUpBadge date={lead.next_follow_up} today={today} />
      </div>
    </Link>
  );
}
