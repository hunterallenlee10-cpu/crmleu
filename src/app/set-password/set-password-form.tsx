"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/form-message";
import { setPassword } from "./actions";

export function SetPasswordForm() {
  const [state, action, pending] = useActionState(setPassword, undefined);

  return (
    <form action={action} className="space-y-5">
      <div>
        <label htmlFor="password" className="label">New password (8+ characters)</label>
        <input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required className="input" />
      </div>
      <div>
        <label htmlFor="confirm" className="label">Type it again</label>
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required className="input" />
      </div>
      <FormMessage state={state} />
      <button type="submit" disabled={pending} className="btn btn-primary w-full">
        {pending ? "Saving…" : "Save password"}
      </button>
    </form>
  );
}
