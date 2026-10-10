import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Everything except static files and the n8n API (which uses its own API key).
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|api/leads|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
