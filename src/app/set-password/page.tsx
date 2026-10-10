import type { Metadata } from "next";
import { AuthShell } from "@/components/brand";
import { getProfile } from "@/lib/auth";
import { SetPasswordForm } from "./set-password-form";

export const metadata: Metadata = { title: "Set your password" };

export default async function SetPasswordPage() {
  const profile = await getProfile();
  return (
    <AuthShell title={`Welcome, ${profile.full_name}`}>
      <p className="text-sm text-muted">Choose a password for {profile.email}.</p>
      <SetPasswordForm />
    </AuthShell>
  );
}
