"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AuthShell } from "@/components/brand";
import { createClient } from "@/lib/supabase/client";

// Supabase's built-in invite and password-reset emails link through Supabase,
// which sends the browser here with the login tokens after the "#".
// We store the session, then send the person on to choose a password.
// (Custom email templates use /auth/confirm instead; both work.)
export default function AuthCallbackPage() {
  const [error, setError] = useState("");

  useEffect(() => {
    async function finishSignIn() {
      const params = new URLSearchParams(window.location.hash.slice(1));
      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");

      if (params.get("error") || !accessToken || !refreshToken) {
        return "That link is invalid or has expired. Ask your admin for a new invite, or request a new reset link.";
      }

      const { error } = await createClient().auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (error) return "We couldn't sign you in with that link. Ask for a new one.";

      // A full page load so the server sees the new session cookie.
      const type = params.get("type");
      window.location.replace(type === "invite" || type === "recovery" ? "/set-password" : "/");
      return "";
    }

    finishSignIn().then(setError);
  }, []);

  return (
    <AuthShell title={error ? "Link problem" : "Signing you in…"}>
      {error ? (
        <div className="space-y-5">
          <p role="alert" className="text-sm text-danger">{error}</p>
          <Link href="/login" className="btn btn-ghost w-full">Back to sign in</Link>
        </div>
      ) : (
        <p className="text-sm text-muted">One moment.</p>
      )}
    </AuthShell>
  );
}
