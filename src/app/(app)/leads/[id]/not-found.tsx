import Link from "next/link";

export default function LeadNotFound() {
  return (
    <div className="card mx-auto mt-8 max-w-md space-y-4 px-6 py-12 text-center">
      <h1 className="text-xl font-semibold tracking-tight">Lead not found</h1>
      <p className="text-muted">It may have been reassigned or deleted.</p>
      <Link href="/leads" className="btn btn-ghost">Back to my leads</Link>
    </div>
  );
}
