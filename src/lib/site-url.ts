import "server-only";
import { headers } from "next/headers";

// The app's public address, for links in emails. Uses NEXT_PUBLIC_SITE_URL,
// falling back to the address this request came in on.
export async function siteUrl(): Promise<string> {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${h.get("host")}`;
}
