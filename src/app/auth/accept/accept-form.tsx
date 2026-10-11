"use client";

import Link from "next/link";
import { useActionState } from "react";
import { acceptInvite } from "./actions";

export function AcceptForm({ tokenHash, type }: { tokenHash: string; type: "invite" | "recovery" }) {
  const [error, action, pending] = useActionState(acceptInvite, undefined);

  if (error) {
    return (
      <div className="space-y-5">
        <p role="alert" className="text-sm text-danger">{error}</p>
        <Link href="/login" className="btn btn-ghost w-full">Back to sign in</Link>
      </div>
    );
  }

  return (
    <form action={action}>
      <input type="hidden" name="token_hash" value={tokenHash} />
      <input type="hidden" name="type" value={type} />
      <button type="submit" disabled={pending} className="btn btn-gold w-full">
        {pending ? "One moment…" : type === "recovery" ? "Continue" : "Accept invite"}
      </button>
    </form>
  );
}
