"use client";

import { useActionState } from "react";
import Link from "next/link";
import { AuthShell } from "@/components/brand";
import { FormMessage } from "@/components/form-message";
import { sendResetLink } from "./actions";

export default function ForgotPasswordPage() {
  const [state, action, pending] = useActionState(sendResetLink, undefined);

  return (
    <AuthShell title="Reset your password">
      <form action={action} className="space-y-5">
        <div>
          <label htmlFor="email" className="label">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required className="input" />
        </div>
        <FormMessage state={state} />
        <button type="submit" disabled={pending} className="btn btn-gold w-full">
          {pending ? "Sending…" : "Email me a reset link"}
        </button>
        <p className="text-center text-sm">
          <Link href="/login" className="text-muted hover:text-gold">Back to sign in</Link>
        </p>
      </form>
    </AuthShell>
  );
}
