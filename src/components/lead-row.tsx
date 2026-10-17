import Link from "next/link";
import { FollowUpBadge, StageBadge } from "@/components/badges";
import type { Lead } from "@/lib/types";

// One lead in a list. The whole card is a big tap target.
export function LeadRow({ lead, today }: { lead: Lead; today: string }) {
  return (
    <Link href={`/leads/${lead.id}`} className="card card-link block px-5 py-4">
      <LeadRowBody lead={lead} today={today} />
    </Link>
  );
}

export function LeadRowBody({ lead, today, owner }: { lead: Lead; today: string; owner?: string }) {
  const place = [lead.city, lead.state].filter(Boolean).join(", ");
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="truncate font-semibold tracking-tight">{lead.business_name}</p>
        <p className="mt-0.5 truncate text-sm text-muted">
          {[lead.contact_name, place, lead.niche].filter(Boolean).join(" · ") || " "}
        </p>
        {owner && <p className="mt-1.5 text-xs font-medium text-gold/80">{owner}</p>}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">
        <StageBadge stage={lead.stage} />
        <FollowUpBadge date={lead.next_follow_up} today={today} />
      </div>
    </div>
  );
}
