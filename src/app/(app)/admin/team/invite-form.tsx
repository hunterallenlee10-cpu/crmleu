"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/form-message";
import { inviteRep } from "./actions";

export function InviteForm() {
  const [state, action, pending] = useActionState(inviteRep, undefined);

  return (
    <form action={action} className="card space-y-4">
      <h2 className="text-lg font-semibold">Invite a rep</h2>
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
      <button type="submit" disabled={pending} className="btn btn-gold w-full sm:w-auto">
        {pending ? "Sending…" : "Send invite"}
      </button>
    </form>
  );
}
