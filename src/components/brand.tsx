// "Lee Enterprises Unlimited" on wider screens, "LEU" on phones.
export function BrandName({ className = "" }: { className?: string }) {
  return (
    <span className={`font-semibold tracking-wide text-gold ${className}`}>
      <span className="sm:hidden">LEU</span>
      <span className="hidden sm:inline">Lee Enterprises Unlimited</span>
    </span>
  );
}

// Centered card used by the login / password pages.
export function AuthShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="flex flex-1 items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-10 text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-muted">LEU CRM</p>
          <h1 className="mt-3 text-2xl font-semibold text-gold">Lee Enterprises Unlimited</h1>
        </div>
        <div className="card space-y-5 p-6">
          <h2 className="text-lg font-semibold">{title}</h2>
          {children}
        </div>
      </div>
    </main>
  );
}
