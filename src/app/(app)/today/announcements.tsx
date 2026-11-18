import { Megaphone } from "lucide-react";
import { formatDateTime } from "@/lib/dates";
import { timeAgo } from "@/lib/leaderboard";
import { AnnouncementForm, DeleteAnnouncement } from "./announcement-controls";

export type Announcement = {
  id: string;
  body: string;
  author_id: string | null;
  created_at: string;
};

// Posts from the admins that everyone on the team sees, newest first.
export function Announcements({
  items,
  names,
  isAdmin,
}: {
  items: Announcement[];
  names: Record<string, string>;
  isAdmin: boolean;
}) {
  const now = new Date();
  return (
    <div className="space-y-4">
      {isAdmin && <AnnouncementForm />}

      {items.length === 0 ? (
        <div className="empty">
          <Megaphone aria-hidden="true" className="empty-icon" strokeWidth={1.75} />
          <p>{isAdmin ? "Nothing posted yet. Anything you post here, the whole team sees." : "No announcements yet."}</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((a) => (
            <li key={a.id} className="rounded-card border border-line bg-surface px-4 py-3">
              <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">{a.body}</p>
              <div className="mt-2 flex items-center gap-2 text-xs text-muted">
                <span>{(a.author_id && names[a.author_id]) || "Admin"}</span>
                <span aria-hidden="true">·</span>
                <time dateTime={a.created_at} title={formatDateTime(a.created_at)}>{timeAgo(a.created_at, now)}</time>
                {isAdmin && <DeleteAnnouncement id={a.id} />}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
