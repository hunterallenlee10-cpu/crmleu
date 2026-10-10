// Mirrors the SQL functions in supabase/migrations (normalize_phone,
// normalize_business_name, normalize_city). The database is the source of
// truth; these are for checking a CSV against itself before import and for
// friendly form errors. Keep them in sync with the SQL.

// "(301) 555-1234" / "+1 301.555.1234" -> "3015551234". Not 10 digits -> null.
export function normalizePhone(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/[^0-9]/g, "");
  if (/^1[0-9]{10}$/.test(digits)) return digits.slice(1);
  if (/^[0-9]{10}$/.test(digits)) return digits;
  return null;
}

// "Joe's Pizza, L.L.C." -> "joes pizza"
export function normalizeBusinessName(raw: string | null | undefined): string {
  return (raw ?? "")
    .toLowerCase()
    .replaceAll("&", " and ")
    .replace(/[,/\\_-]/g, " ")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/( (llc|inc|corp|co|ltd))+$/, "")
    .trim();
}

export function normalizeCity(raw: string | null | undefined): string {
  return (raw ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

// "3015551234" -> "(301) 555-1234"
export function formatPhone(phone: string | null | undefined): string {
  if (!phone || phone.length !== 10) return phone ?? "";
  return `(${phone.slice(0, 3)}) ${phone.slice(3, 6)}-${phone.slice(6)}`;
}
