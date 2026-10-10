import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function signOut(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();

  const error = request.nextUrl.searchParams.get("error");
  const location = error ? `/login?error=${encodeURIComponent(error)}` : "/login";
  // 303 so the browser follows with a GET, even after the POST from the button.
  return new NextResponse(null, { status: 303, headers: { Location: location } });
}

export const GET = signOut;  // used when a deactivated user is bounced out
export const POST = signOut; // the "Sign out" button
