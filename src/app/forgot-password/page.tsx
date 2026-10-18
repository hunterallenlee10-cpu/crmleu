import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { AuthShell } from "@/components/brand";
import { emailEnabled } from "@/lib/email";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "Reset your password" };

export default async function ForgotPasswordPage() {
  await connection(); // read AUTH_EMAIL_ENABLED per request, not at build time
  return (
    <AuthShell title="Reset your password">
      {emailEnabled() ? (
        <ForgotPasswordForm />
      ) : (
        // Email is off (see lib/email.ts), so the admin sends a sign-in link instead.
        <div className="space-y-5">
          <p className="text-sm text-muted">
            Ask your admin for a sign-in link. They can make one from the Team page, and it lets you choose a new password.
          </p>
          <Link href="/login" className="btn btn-secondary w-full">Back to sign in</Link>
        </div>
      )}
    </AuthShell>
  );
}
