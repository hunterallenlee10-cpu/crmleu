"use client";

import { useActionState, useEffect } from "react";
import Link from "next/link";
import { signIn } from "./actions";
import { FormMessage } from "@/components/form-message";

export function LoginForm({ notice }: { notice?: string }) {
  const [state, action, pending] = useActionState(signIn, notice ? { error: notice } : undefined);

  // If an email sign-in link landed here instead of /auth/callback, pass it on.
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes("access_token") || hash.includes("error_code")) {
      window.location.replace(`/auth/callback${hash}`);
    }
  }, []);

  return (
    <form action={action} className="space-y-5">
      <div>
        <label htmlFor="email" className="label">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required className="input" defaultValue={state?.fields?.email} key={state?.fields?.email} />
      </div>
      <div>
        <label htmlFor="password" className="label">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="input" />
      </div>
      <FormMessage state={state} />
      <button type="submit" disabled={pending} className="btn btn-primary w-full">
        {pending ? "Signing in…" : "Sign in"}
      </button>
      <p className="text-center text-sm">
        <Link href="/forgot-password" className="rounded-[4px] text-muted underline-offset-4 transition-colors duration-150 hover:text-fg hover:underline">
          Forgot your password?
        </Link>
      </p>
    </form>
  );
}
