// ============================================================
// Cantaia — Supplier portal tokens
//
// A price request carries an opaque `portal_token` that lets the supplier
// open /offre/<token> and type their prices in directly, with no account.
// The token IS the credential, so it must be unguessable and never derived
// from the price-request id (unlike the human-readable tracking code, which
// is printed in the email body on purpose).
// ============================================================

import { randomBytes } from "crypto";

/** 64 hex chars = 256 bits of entropy. */
export function generatePortalToken(): string {
  return randomBytes(32).toString("hex");
}

/** Cheap shape check before hitting the database. */
export function isValidPortalTokenFormat(token: unknown): token is string {
  return typeof token === "string" && /^[a-f0-9]{32,128}$/i.test(token);
}

/**
 * Absolute URL of the supplier portal page.
 *
 * `baseUrl` should be NEXT_PUBLIC_APP_URL. The locale segment is required by
 * the app router; it defaults to the supplier's own language so the portal
 * opens in the language the email was written in.
 */
export function buildPortalUrl(
  baseUrl: string,
  token: string,
  locale: "fr" | "de" | "en" = "fr"
): string {
  const root = (baseUrl || "").replace(/\/+$/, "");
  return `${root}/${locale}/offre/${token}`;
}
