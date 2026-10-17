import { ThemeToggle } from "@/components/theme-toggle";

// The gold "L" monogram, matching the favicon.
export function BrandMark({ className = "size-8 text-lg" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-[28%] border border-gold/35 bg-gradient-to-b from-mark to-ink font-serif font-bold text-gold shadow-[inset_0_1px_0_rgb(255_255_255/0.06),0_4px_14px_-6px_rgb(201_162_74/0.45)] ${className}`}
      style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
    >
      L
    </span>
  );
}

// "Lee Enterprises Unlimited" on wider screens, "LEU" on phones.
export function BrandName({ className = "" }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2.5 font-semibold tracking-wide ${className}`}>
      <BrandMark />
      <span className="bg-gradient-to-b from-gold-light to-gold bg-clip-text text-transparent">
        <span className="sm:hidden">LEU</span>
        <span className="hidden sm:inline">Lee Enterprises Unlimited</span>
      </span>
    </span>
  );
}

// Centered card used by the login / password pages.
export function AuthShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="relative flex flex-1 items-center justify-center overflow-hidden px-5 py-12">
      <ThemeToggle className="absolute top-4 right-4" />
      {/* Gold glow behind the card */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-1/2 -z-10 size-[560px] -translate-x-1/2 -translate-y-[60%] rounded-full bg-gold/[0.07] blur-3xl"
      />
      <div className="w-full max-w-sm motion-safe:animate-pop-in">
        <div className="mb-9 flex flex-col items-center text-center">
          <BrandMark className="size-14 text-3xl" />
          <p className="eyebrow mt-6 text-muted">LEU CRM</p>
          <h1 className="mt-2 bg-gradient-to-b from-gold-light to-gold bg-clip-text text-2xl font-semibold tracking-tight text-transparent">
            Lee Enterprises Unlimited
          </h1>
        </div>
        <div className="card space-y-5 p-6 sm:p-7">
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          {children}
        </div>
      </div>
    </main>
  );
}
