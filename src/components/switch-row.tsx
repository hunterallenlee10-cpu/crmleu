"use client";

// A full-width on/off switch with a title and a short line explaining the
// current state. Used in forms, so it's a plain button that never submits.
export function SwitchRow({
  checked,
  onChange,
  title,
  description,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 rounded-control border border-line px-3 py-2.5 text-left transition-colors duration-150 hover:border-line-strong"
    >
      <span>
        <span className="block font-medium">{title}</span>
        <span className="block text-label text-muted">{description}</span>
      </span>
      <span className={`relative h-6 w-10 shrink-0 rounded-full transition-colors duration-150 ${checked ? "bg-accent" : "bg-line-strong"}`}>
        <span className={`absolute top-1 size-4 rounded-full transition-[left,background-color] duration-150 ${checked ? "left-5 bg-on-accent" : "left-1 bg-muted"}`} />
      </span>
    </button>
  );
}
