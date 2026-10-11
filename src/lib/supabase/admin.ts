import "server-only";
import { createClient } from "@supabase/supabase-js";

// Service-role client: bypasses row-level security. Server-only.
// Used for: inviting users, deactivating users, the n8n API, and the seed script.
// Always check permissions yourself before calling this.
export function createAdminClient() {
  // Trimmed because a pasted key often carries a stray newline or space,
  // which Supabase rejects as "Invalid API key".
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");

  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(), key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
