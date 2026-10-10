import { getProfile } from "@/lib/auth";

// Phase 1 placeholder. Phase 2 replaces this with the Today screen.
export default async function HomePage() {
  const profile = await getProfile();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Hi, {profile.full_name}</h1>
      <div className="card text-muted">
        You&apos;re signed in as <span className="text-fg">{profile.role}</span>. Lead screens are coming in the next phase.
      </div>
    </div>
  );
}
