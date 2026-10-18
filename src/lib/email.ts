import "server-only";

// Whether the app may ask Supabase to send email (invites, password resets).
// Off unless AUTH_EMAIL_ENABLED=true. Supabase's built-in email only delivers
// to members of your Supabase team, so emails to reps bounce, and bounces get
// the project's email blocked. Turn this on once custom SMTP is set up.
export function emailEnabled(): boolean {
  return process.env.AUTH_EMAIL_ENABLED?.trim() === "true";
}
