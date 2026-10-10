// Dates for follow-ups are plain "YYYY-MM-DD" strings in the company
// timezone (America/New_York), so "today" means today in New York.

export const TIMEZONE = "America/New_York";

export function todayNY(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(now);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000,
  );
}

// "Oct 12" (or "Oct 12, 2027" if not this year)
export function formatDate(date: string, today: string = todayNY()): string {
  const d = new Date(`${date}T12:00:00Z`);
  const sameYear = date.slice(0, 4) === today.slice(0, 4);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
    timeZone: "UTC",
  });
}

// "Oct 12, 3:45 PM" in New York time
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: TIMEZONE,
  });
}

// "Overdue 3d" / "Today" / "Tomorrow" / "Oct 12"
export function followUpLabel(date: string, today: string = todayNY()) {
  const diff = daysBetween(today, date);
  if (diff < 0) return { text: `Overdue ${-diff}d`, tone: "overdue" as const };
  if (diff === 0) return { text: "Today", tone: "today" as const };
  if (diff === 1) return { text: "Tomorrow", tone: "upcoming" as const };
  return { text: formatDate(date, today), tone: "upcoming" as const };
}
