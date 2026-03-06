/**
 * Swiss locale formatting utilities.
 * Uses Intl APIs with Swiss locale variants for consistent formatting.
 */

type AppLocale = "fr" | "de" | "en";

const LOCALE_MAP: Record<AppLocale, string> = {
  fr: "fr-CH",
  de: "de-CH",
  en: "en-CH",
};

function resolveLocale(locale?: string): string {
  return LOCALE_MAP[(locale as AppLocale)] || "fr-CH";
}

/** Format a number with Swiss thousands separator (apostrophe) */
export function formatNumber(
  value: number,
  locale?: string,
  options?: Intl.NumberFormatOptions
): string {
  return new Intl.NumberFormat(resolveLocale(locale), options).format(value);
}

/** Format currency in CHF with Swiss formatting: CHF 1'234.56 */
export function formatCHF(value: number, locale?: string): string {
  return new Intl.NumberFormat(resolveLocale(locale), {
    style: "currency",
    currency: "CHF",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/** Format a date string to Swiss short format: 05.03.2026 */
export function formatDate(
  dateStr: string | Date,
  locale?: string,
  options?: Intl.DateTimeFormatOptions
): string {
  const date = typeof dateStr === "string" ? new Date(dateStr) : dateStr;
  return date.toLocaleDateString(resolveLocale(locale), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...options,
  });
}

/** Format a date string to Swiss long format: 5 mars 2026 / 5. März 2026 */
export function formatDateLong(dateStr: string | Date, locale?: string): string {
  const date = typeof dateStr === "string" ? new Date(dateStr) : dateStr;
  return date.toLocaleDateString(resolveLocale(locale), {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Format a date string to short month: 5 mars / 5. Mär */
export function formatDateShort(dateStr: string | Date, locale?: string): string {
  const date = typeof dateStr === "string" ? new Date(dateStr) : dateStr;
  return date.toLocaleDateString(resolveLocale(locale), {
    day: "numeric",
    month: "short",
  });
}

/** Format a date string with time: 05.03.2026, 14:30 */
export function formatDateTime(dateStr: string | Date, locale?: string): string {
  const date = typeof dateStr === "string" ? new Date(dateStr) : dateStr;
  return date.toLocaleDateString(resolveLocale(locale), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Format a percentage: 85.3% */
export function formatPercent(value: number, locale?: string): string {
  return new Intl.NumberFormat(resolveLocale(locale), {
    style: "percent",
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(value / 100);
}
