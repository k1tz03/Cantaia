// ============================================================
// Cantaia — Organization branding resolver (CONTRACT: Agent O)
// ============================================================
//
// `organizations.logo_url` / `primary_color` have existed since migration 005
// and were consumed by exactly zero document generator: every PDF, every
// transactional email said "Cantaia" even for a customer paying for branding.
//
// This module is the single resolver. It is consumed by:
//   - the PV / Visite PDF generators (Agent O)
//   - the financial document generators (Agent F, via
//     packages/core/src/financials/org-branding.ts)
//   - the report / notification surfaces (Agents B, E2)
//
// CONTRACT — do not change the shape without updating the consumers:
//
//   getOrgBranding(admin, orgId) => Promise<OrgBranding>
//   OrgBranding = { name: string; logoUrl: string | null; primaryColor: string }
//
// Guarantees:
//   1. NEVER throws. A branding failure must not take a document export down.
//   2. Always returns a usable `name` and `primaryColor` (Cantaia defaults).
//   3. `logoUrl` is a URL that can be fetched: an absolute `logo_url` is
//      returned as-is, a bare storage path is signed against the
//      `organization-assets` bucket.
//
// The package must stay free of a `@supabase/supabase-js` dependency (it is
// imported from both server routes and, via the barrel, client bundles), hence
// the structural `BrandingDbClient` type instead of `SupabaseClient`.

/** Storage bucket holding org logos (see /api/organization/upload-logo). */
export const ORG_ASSETS_BUCKET = "organization-assets";

/** Signed-URL lifetime for a logo — long enough for a PDF render, short enough to not leak. */
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour

export interface OrgBranding {
  /** Organization display name — falls back to "Cantaia". */
  name: string;
  /** Fetchable logo URL, or null when the org has no logo. */
  logoUrl: string | null;
  /** `#RRGGBB` accent colour — falls back to Cantaia orange. */
  primaryColor: string;
}

/** Cantaia defaults, used when the org row is missing, empty or unreadable. */
export const DEFAULT_BRANDING: OrgBranding = {
  name: "Cantaia",
  logoUrl: null,
  primaryColor: "#F97316",
};

/**
 * Minimal structural type for the Supabase admin client. Only the two calls
 * this module makes are described — anything wider would force the dependency.
 */
export interface BrandingDbClient {
  from(table: string): any;
  storage?: {
    from(bucket: string): {
      createSignedUrl(
        path: string,
        expiresIn: number
      ): Promise<{ data: { signedUrl: string } | null; error: unknown }>;
    };
  };
}

/** A stored `logo_url` may be an absolute URL (public bucket) or a bare path. */
function isAbsoluteUrl(value: string): boolean {
  return /^(https?:|data:)/i.test(value);
}

/** `#RGB` / `#RRGGBB` / `RRGGBB` → normalised `#RRGGBB`, or null when unusable. */
function normalizeHexColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const clean = value.replace("#", "").trim();
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return `#${full.toUpperCase()}`;
}

/**
 * Turns a stored `logo_url` into something fetchable.
 * Absolute URLs pass through; a bare path is signed against the assets bucket.
 * Returns null on any failure — a missing logo is never an error.
 */
async function resolveLogoUrl(
  admin: BrandingDbClient,
  rawLogoUrl: unknown
): Promise<string | null> {
  const raw = typeof rawLogoUrl === "string" ? rawLogoUrl.trim() : "";
  if (!raw) return null;
  if (isAbsoluteUrl(raw)) return raw;

  // Bare storage path (e.g. "<orgId>/logo.png"), possibly prefixed with the
  // bucket name by an older writer — strip it so we never sign "bucket/bucket/…".
  const path = raw.replace(/^\/+/, "").replace(new RegExp(`^${ORG_ASSETS_BUCKET}/`), "");
  if (!path) return null;

  try {
    const storage = admin.storage;
    if (!storage) return null;
    const { data, error } = await storage
      .from(ORG_ASSETS_BUCKET)
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}

/**
 * Resolve an organization's letterhead: name, logo and accent colour.
 *
 * Never throws. Callers can use the result unconditionally:
 *
 *   const branding = await getOrgBranding(admin, orgId);
 *   // branding.name        → "Constructions SA" | "Cantaia"
 *   // branding.logoUrl     → fetchable URL | null
 *   // branding.primaryColor→ "#1E3A5F" | "#F97316"
 */
export async function getOrgBranding(
  admin: BrandingDbClient,
  orgId: string | null | undefined
): Promise<OrgBranding> {
  if (!orgId || !admin) return { ...DEFAULT_BRANDING };

  try {
    const { data, error } = await admin
      .from("organizations")
      .select("name, logo_url, primary_color")
      .eq("id", orgId)
      .maybeSingle();

    if (error || !data) return { ...DEFAULT_BRANDING };

    const logoUrl = await resolveLogoUrl(admin, data.logo_url);

    return {
      name: (typeof data.name === "string" && data.name.trim()) || DEFAULT_BRANDING.name,
      logoUrl,
      primaryColor: normalizeHexColor(data.primary_color) || DEFAULT_BRANDING.primaryColor,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[branding] getOrgBranding(${orgId}) failed — using defaults: ${message}`);
    return { ...DEFAULT_BRANDING };
  }
}

/** `#RRGGBB` → `[r, g, b]`, for canvases that want channels (jsPDF, canvas). */
export function hexToRgb(hex: string): [number, number, number] {
  const normalized = normalizeHexColor(hex);
  if (!normalized) return [249, 115, 22]; // Cantaia orange
  const clean = normalized.slice(1);
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

/**
 * Perceived-luminance test — tells a renderer whether to put white or black
 * text on top of the accent colour. A customer picking a pale yellow must not
 * end up with unreadable white-on-yellow headers.
 */
export function isLightColor(hex: string): boolean {
  const [r, g, b] = hexToRgb(hex);
  // Rec. 709 relative luminance, 0–255 scale.
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 160;
}

/** Text colour that stays readable on top of `hex`. */
export function contrastTextColor(hex: string): "#0A0A0A" | "#FFFFFF" {
  return isLightColor(hex) ? "#0A0A0A" : "#FFFFFF";
}
