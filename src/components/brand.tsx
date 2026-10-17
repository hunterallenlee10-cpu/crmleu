import Image from "next/image";
import { ThemeToggle } from "@/components/theme-toggle";

// The LEU mark. Both finishes render; CSS shows silver on dark and gold on light
// (see .logo-dark / .logo-light in globals.css). Only the visible one downloads,
// because next/image lazy-loads and display:none images are never fetched.
// Height comes from the className; width follows the image's own aspect ratio.
export function Logo({ className = "h-8", highPriority = false }: { className?: string; highPriority?: boolean }) {
  const shared = {
    fetchPriority: highPriority ? ("high" as const) : undefined,
    draggable: false,
  };
  return (
    <>
      <Image {...shared} alt="Lee Enterprises Unlimited" src="/brand/leu-logo-silver.webp" width={512} height={500} className={`logo-dark w-auto shrink-0 ${className}`} />
      <Image {...shared} alt="Lee Enterprises Unlimited" src="/brand/leu-logo-gold.webp" width={512} height={480} className={`logo-light w-auto shrink-0 ${className}`} />
    </>
  );
}

// "Lee Enterprises Unlimited" on wider screens, "LEU" on phones.
export function BrandName({ className = "" }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2.5 font-semibold text-fg ${className}`}>
      <Logo className="h-6 sm:h-[30px]" />
      <span>
        <span className="sm:hidden">LEU</span>
        <span className="hidden sm:inline">Lee Enterprises Unlimited</span>
      </span>
    </span>
  );
}

// Centered card used by the login / password pages.
export function AuthShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="relative flex flex-1 items-center justify-center px-5 py-12">
      <ThemeToggle className="absolute top-4 right-4" />
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo className="h-20" highPriority />
          <p className="mt-5 text-label font-medium text-muted">LEU CRM</p>
          <h1 className="mt-1 text-lg font-semibold tracking-tight">Lee Enterprises Unlimited</h1>
        </div>
        <div className="space-y-5 rounded-card border border-line bg-surface p-6 sm:p-7">
          <h2 className="text-base font-semibold">{title}</h2>
          {children}
        </div>
      </div>
    </main>
  );
}
