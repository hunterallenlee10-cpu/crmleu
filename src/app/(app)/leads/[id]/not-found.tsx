import { SearchX } from "lucide-react";
import Link from "next/link";

export default function LeadNotFound() {
  return (
    <div className="mx-auto mt-8 flex max-w-md flex-col items-center gap-3 rounded-card border border-dashed border-line px-6 py-12 text-center">
      <SearchX aria-hidden="true" className="size-6 text-faint" strokeWidth={1.75} />
      <h1 className="text-base font-semibold">Lead not found</h1>
      <p className="text-muted">It may have been reassigned or deleted.</p>
      <Link href="/leads" className="btn btn-secondary mt-1">Back to my leads</Link>
    </div>
  );
}
