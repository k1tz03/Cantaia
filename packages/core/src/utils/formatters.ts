/**
 * Format a CHF amount with Swiss conventions (e.g., CHF 1'234.50)
 */
export function formatCHF(amount: number, currency = "CHF"): string {
  const formatted = amount.toLocaleString("de-CH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${currency} ${formatted}`;
}

/**
 * Format a user's full name
 */
export function formatFullName(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`;
}

/**
 * Truncate text with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1) + "\u2026";
}

/**
 * Format percentage with Swiss conventions
 */
export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}
