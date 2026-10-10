import type { Metadata } from "next";
import { AuthShell } from "@/components/brand";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

const NOTICES: Record<string, string> = {
  inactive: "Your account is turned off. Ask your admin if you think this is a mistake.",
  link: "That link is invalid or has expired. Ask for a new one.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;
  const notice = typeof error === "string" ? NOTICES[error] : undefined;

  return (
    <AuthShell title="Sign in">
      <LoginForm notice={notice} />
    </AuthShell>
  );
}
