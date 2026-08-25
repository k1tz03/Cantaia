// ============================================================
// PDF branding — letterhead resolution for @react-pdf documents
// ============================================================
// `getOrgBranding()` (@cantaia/core/branding) returns a logo URL. Handing that
// URL straight to <Image src="https://…"> makes the renderer fetch it during
// layout: on a cold serverless invocation that is an unbounded network call in
// the middle of PDF generation, and a 404 throws — taking the whole export
// down for a cosmetic asset.
//
// So the URL is fetched HERE, with a timeout, and turned into a data URI before
// the document is built. A failure degrades to "no logo", never to "no PDF".

import { getOrgBranding, contrastTextColor, type OrgBranding } from "@cantaia/core/branding";

export type { OrgBranding };
export { contrastTextColor };

/** A logo bigger than this is a mistake, not a letterhead. */
const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2 MB — matches the upload limit
const LOGO_FETCH_TIMEOUT_MS = 4_000;

/** Formats @react-pdf can decode. SVG is deliberately excluded. */
const SUPPORTED_LOGO_TYPES = new Set(["image/png", "image/jpeg", "image/jpg"]);

/** Branding as consumed by the document components. */
export interface PdfBranding extends OrgBranding {
  /** `data:image/png;base64,…` ready for <Image src>, or null. */
  logoData: string | null;
}

/** Cantaia fallback — a document always has a letterhead. */
export const DEFAULT_PDF_BRANDING: PdfBranding = {
  name: "Cantaia",
  logoUrl: null,
  logoData: null,
  primaryColor: "#F97316",
};

/**
 * Downloads a logo and encodes it as a data URI.
 * Returns null on any problem (timeout, 404, wrong type, oversized).
 */
export async function fetchLogoDataUri(url: string | null): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith("data:")) return url;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOGO_FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;

    const contentType = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (contentType && !SUPPORTED_LOGO_TYPES.has(contentType)) return null;

    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length === 0 || buffer.length > MAX_LOGO_BYTES) return null;

    const mime = SUPPORTED_LOGO_TYPES.has(contentType) ? contentType : "image/png";
    return `data:${mime};base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * One call for a document generator: resolve the org letterhead and inline its
 * logo. Never throws.
 */
export async function resolvePdfBranding(
  admin: unknown,
  organizationId: string | null | undefined
): Promise<PdfBranding> {
  try {
    const branding = await getOrgBranding(admin as any, organizationId);
    const logoData = await fetchLogoDataUri(branding.logoUrl);
    return { ...branding, logoData };
  } catch {
    return { ...DEFAULT_PDF_BRANDING };
  }
}
