import Link from "next/link";

export default function LeadNotFound() {
  return (
    <div className="mx-auto max-w-md space-y-4 py-16 text-center">
      <h1 className="text-xl font-semibold">Lead not found</h1>
      <p className="text-muted">It may have been reassigned or deleted.</p>
      <Link href="/leads" className="btn btn-ghost">Back to my leads</Link>
    </div>
  );
}
