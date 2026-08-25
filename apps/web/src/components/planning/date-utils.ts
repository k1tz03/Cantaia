// -----------------------------------------------------------------------------
// Local date helpers for the planning / Gantt UI.
//
// The repo convention (Europe/Zurich) forbids `toISOString().split("T")[0]` for
// a LOCAL date: toISOString() formats in UTC and can shift the calendar day
// across the timezone boundary. These helpers format from the LOCAL components
// instead, matching packages/core's `toIsoDate`.
// -----------------------------------------------------------------------------

/** Format a Date as a local YYYY-MM-DD. */
export function toIsoDateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Add `days` to a YYYY-MM-DD string, returning a local YYYY-MM-DD. */
export function addIsoDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return toIsoDateLocal(d);
}
