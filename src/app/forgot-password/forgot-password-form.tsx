"use client";

import { useActionState } from "react";
import Link from "next/link";
import { FormMessage } from "@/components/form-message";
import { sendResetLink } from "./actions";

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(sendResetLink, undefined);

  return (
    <form action={action} className="space-y-5">
      <div>
        <label htmlFor="email" className="label">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required className="input" />
      </div>
      <FormMessage state={state} />
      <button type="submit" disabled={pending} className="btn btn-primary w-full">
        {pending ? "Sending…" : "Email me a reset link"}
      </button>
      <p className="text-center text-sm">
        <Link href="/login" className="rounded-[4px] text-muted underline-offset-4 transition-colors duration-150 hover:text-fg hover:underline">Back to sign in</Link>
      </p>
    </form>
  );
}
