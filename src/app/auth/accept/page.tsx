import type { Metadata } from "next";
import { AuthShell } from "@/components/brand";
import { AcceptForm } from "./accept-form";

export const metadata: Metadata = { title: "Accept your invite" };

// Invite and sign-in links an admin copies and texts land here. The one-time token is
// only used when the rep taps the button: message apps open links on their
// own to build previews, and that would use up a link that verified on load.
export default async function AcceptInvitePage({ searchParams }: PageProps<"/auth/accept">) {
  const { token_hash, type } = await searchParams;
  // "recovery" links go to people who already have an account (see inviteRep).
  const isReset = type === "recovery";

  return (
    <AuthShell title={isReset ? "Set up your login" : "You're invited"}>
      <p className="text-sm text-muted">
        {isReset
          ? "Tap below to sign in to the LEU team CRM and choose your password."
          : "Lee Enterprises Unlimited has invited you to the team CRM."}
      </p>
      <AcceptForm tokenHash={typeof token_hash === "string" ? token_hash : ""} type={isReset ? "recovery" : "invite"} />
    </AuthShell>
  );
}
