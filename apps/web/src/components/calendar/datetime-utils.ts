// ============================================================
// Calendar datetime utils — client-side helpers (CAL.C1)
// ============================================================

/**
 * Build an ISO-8601 datetime string WITH the browser's local UTC offset
 * from separate date ("YYYY-MM-DD") and time ("HH:mm") input values.
 * Example (browser in Europe/Zurich, summer):
 *   toLocalISOString("2026-08-24", "14:00") → "2026-08-24T14:00:00+02:00"
 *
 * Without the explicit offset, Postgres (timestamptz) interprets the naive
 * string as UTC and the event shifts by the local offset (CAL.C1: an event
 * created at 14:00 showed up at 16:00 in Cantaia).
 * The offset is computed for the given date, so DST is handled correctly.
 */
export function toLocalISOString(date: string, time: string): string {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const local = new Date(y, (mo || 1) - 1, d || 1, h || 0, mi || 0, 0);
  const offsetMin = -local.getTimezoneOffset(); // e.g. +120 for CEST
  const sign = offsetMin >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMin);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date}T${pad(h || 0)}:${pad(mi || 0)}:00` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}

/**
 * Local calendar date "YYYY-MM-DD" of a Date (NOT toISOString(), which
 * returns the UTC date and is off by one around midnight — CAL.B1).
 */
export function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Map an app locale ("fr" | "en" | "de") to a BCP-47 formatting tag. */
export function toLocaleTag(locale: string): string {
  if (locale === "de") return "de-CH";
  if (locale === "en") return "en-GB";
  return "fr-CH";
}
