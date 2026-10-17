"use client";

import { useActionState, useState } from "react";
import { FormMessage } from "@/components/form-message";
import { inviteRep } from "./actions";

export function InviteForm({ emailEnabled }: { emailEnabled: boolean }) {
  const [state, action, pending] = useActionState(inviteRep, undefined);

  return (
    <form action={action} className="card card-glow space-y-4">
      <h2 className="text-lg font-semibold tracking-tight">Invite a rep</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="full_name" className="label">Name</label>
          <input id="full_name" name="full_name" required className="input" defaultValue={state?.fields?.full_name} key={`n-${state?.fields?.full_name}`} />
        </div>
        <div>
          <label htmlFor="email" className="label">Email</label>
          <input id="email" name="email" type="email" required className="input" defaultValue={state?.fields?.email} key={`e-${state?.fields?.email}`} />
        </div>
      </div>
      <FormMessage state={state} />
      {state?.link && <CopyLink link={state.link} key={state.link} />}
      <div className="flex flex-wrap gap-3">
        {/* The link button comes first so pressing Enter makes a link, not an email. */}
        <button type="submit" name="mode" value="link" disabled={pending} className="btn btn-gold w-full sm:w-auto">
          {pending ? "Working…" : "Create invite link"}
        </button>
        {emailEnabled && (
          <button type="submit" name="mode" value="email" disabled={pending} className="btn btn-ghost w-full sm:w-auto">
            Send invite email
          </button>
        )}
      </div>
      <p className="text-xs text-muted">
        Text the link to the rep yourself. Each link works once, and making a new one cancels the last. If someone already has an account, you get a link for them to choose a new password.
      </p>
    </form>
  );
}

function CopyLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      // Clipboard blocked: the field is selectable, so they can copy by hand.
    }
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <input
        readOnly
        aria-label="Invite link"
        className="input flex-1 text-sm"
        value={link}
        onFocus={(e) => e.currentTarget.select()}
      />
      <button type="button" onClick={copy} className="btn btn-gold">
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
