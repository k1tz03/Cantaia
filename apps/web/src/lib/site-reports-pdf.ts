// ============================================================
// Cantaia — Branded PDF helpers for site-report documents
// ============================================================
// `organizations.logo_url` and `primary_color` existed for months and were
// consumed by exactly zero export. Every site-report PDF now goes through
// `drawLetterhead()`, and long values are wrapped instead of being amputated
// with `.slice(0, 25)` (which silently turned "Rénovation Chemin des Vignes 12"
// into "Rénovation Chemin des V").

import { hexToRgb, type OrgBranding } from "@cantaia/core/financials";

/** jsPDF instance — typed loosely so the module stays import-free at build. */
type PdfDoc = any;

const LOGO_MAX_BYTES = 1_500_000;

/**
 * SSRF guard. `organizations.logo_url` is org-admin-controlled and fetched
 * server-side during PDF export — an arbitrary URL would let an admin make the
 * server hit internal endpoints (cloud metadata 169.254.169.254, localhost
 * services, etc.). Logos are only ever stored in the Supabase `organization-assets`
 * bucket, so the ONLY legitimate host is the configured Supabase project host.
 * Everything else (other hosts, raw IPs, localhost, non-http schemes) is refused.
 */
function isAllowedLogoUrl(raw: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return false;
  try {
    // Exact host match with the Supabase project. This inherently blocks raw
    // IPs, localhost and metadata hosts unless Supabase itself is configured to
    // them (local dev), which is the intended, trusted target.
    return parsed.host === new URL(supabaseUrl).host;
  } catch {
    return false;
  }
}

/**
 * Fetch a logo and return a data URL jsPDF can embed.
 * Returns null for anything that is not a raster image (SVG is refused: jsPDF
 * cannot render it and it is a stored-XSS vector elsewhere in the product).
 */
export async function fetchLogoDataUrl(
  logoUrl: string | null | undefined,
): Promise<{ dataUrl: string; format: "PNG" | "JPEG" } | null> {
  if (!logoUrl || !/^https?:\/\//i.test(logoUrl)) return null;
  if (!isAllowedLogoUrl(logoUrl)) return null;

  try {
    const res = await fetch(logoUrl);
    if (!res.ok) return null;

    const contentType = (res.headers.get("content-type") || "").toLowerCase();
    const format: "PNG" | "JPEG" | null = contentType.includes("png")
      ? "PNG"
      : contentType.includes("jpeg") || contentType.includes("jpg")
        ? "JPEG"
        : null;
    if (!format) return null;

    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.byteLength === 0 || buffer.byteLength > LOGO_MAX_BYTES) return null;

    return {
      dataUrl: `data:image/${format.toLowerCase()};base64,${buffer.toString("base64")}`,
      format,
    };
  } catch {
    return null;
  }
}

export interface LetterheadOptions {
  branding: OrgBranding;
  logo?: { dataUrl: string; format: "PNG" | "JPEG" } | null;
  title: string;
  subtitle?: string;
  /** Right-aligned metadata lines (period, project, generation date…). */
  meta?: string[];
}

/**
 * Draw the org letterhead at the top of a page.
 * Returns the Y coordinate where the body may start.
 */
export function drawLetterhead(doc: PdfDoc, opts: LetterheadOptions): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const [r, g, b] = hexToRgb(opts.branding.primaryColor);
  const marginX = 14;
  let y = 16;

  if (opts.logo) {
    try {
      doc.addImage(opts.logo.dataUrl, opts.logo.format, marginX, y - 4, 26, 13, undefined, "FAST");
    } catch {
      /* a broken logo must never break the export */
    }
  }

  const textX = opts.logo ? marginX + 32 : marginX;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(r, g, b);
  doc.text(opts.branding.name, textX, y);

  y += 7;
  doc.setFontSize(15);
  doc.setTextColor(24, 24, 27);
  doc.text(opts.title, textX, y);

  if (opts.subtitle) {
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(90, 90, 95);
    doc.text(opts.subtitle, textX, y);
  }

  if (opts.meta?.length) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(90, 90, 95);
    let metaY = 16;
    for (const line of opts.meta) {
      doc.text(line, pageWidth - marginX, metaY, { align: "right" });
      metaY += 5;
    }
    y = Math.max(y, metaY - 5);
  }

  y += 6;
  doc.setDrawColor(r, g, b);
  doc.setLineWidth(0.6);
  doc.line(marginX, y, pageWidth - marginX, y);
  doc.setDrawColor(200, 200, 205);
  doc.setLineWidth(0.2);
  doc.setTextColor(24, 24, 27);

  return y + 7;
}

/**
 * Wrap text to a column width, capped at `maxLines` (an ellipsis marks the cut
 * so a truncated cell is visibly truncated instead of quietly wrong).
 */
export function wrapText(doc: PdfDoc, text: string, maxWidth: number, maxLines = 2): string[] {
  const value = (text || "").toString().trim();
  if (!value) return [""];

  const lines: string[] = doc.splitTextToSize(value, maxWidth);
  if (lines.length <= maxLines) return lines;

  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = `${kept[maxLines - 1].replace(/\s+\S*$/, "")}…`;
  return kept;
}

/** Swiss-formatted CHF amount for PDF/CSV output. */
export function formatChf(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return "—";
  return amount.toLocaleString("fr-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Footer with the generation timestamp + page number, on every page. */
export function drawFooter(doc: PdfDoc, note?: string): void {
  const pageCount = doc.internal.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const stamp = new Date().toLocaleDateString("fr-CH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(130, 130, 135);
    doc.text(note ? `${note} — généré le ${stamp}` : `Généré le ${stamp}`, 14, pageHeight - 8);
    doc.text(`${i} / ${pageCount}`, pageWidth - 14, pageHeight - 8, { align: "right" });
  }
  doc.setTextColor(24, 24, 27);
}
