import type { Metadata } from "next";
import { AuthShell } from "@/components/brand";
import { acceptInvite } from "./actions";

export const metadata: Metadata = { title: "Accept your invite" };

// Invite links an admin copies and texts land here. The one-time token is
// only used when the rep taps the button: message apps open links on their
// own to build previews, and that would use up a link that verified on load.
export default async function AcceptInvitePage({ searchParams }: PageProps<"/auth/accept">) {
  const { token_hash } = await searchParams;

  return (
    <AuthShell title="You're invited">
      <p className="text-sm text-muted">Lee Enterprises Unlimited has invited you to the team CRM.</p>
      <form action={acceptInvite}>
        <input type="hidden" name="token_hash" value={typeof token_hash === "string" ? token_hash : ""} />
        <button type="submit" className="btn btn-gold w-full">Accept invite</button>
      </form>
    </AuthShell>
  );
}
