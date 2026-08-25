import { getOrgBranding } from "@cantaia/core/branding";
import {
  cleanDescriptionForSupplier,
  formatSupplierDate,
  formatSupplierNumber,
  normalizeSupplierLanguage,
  supplierStrings,
  type SupplierLanguage,
} from "@cantaia/core/submissions";

/**
 * Purchase order (bon de commande / Bestellung) builder.
 *
 * Lives in lib/ (not in a route.ts): Next.js refuses any non-handler export
 * from a route file at build time, and this builder is shared between
 * GET /api/submissions/[id]/purchase-order (download) and the award action of
 * PATCH /api/submissions/[id] (email attachment).
 */

export interface PurchaseOrderLine {
  item_number: string | null;
  description: string;
  unit: string | null;
  quantity: number | null;
  unit_price_ht: number | null;
  total_ht: number | null;
}

export interface PurchaseOrder {
  buffer: Buffer;
  filename: string;
  reference: string;
  totalHt: number;
  lines: PurchaseOrderLine[];
  supplierName: string | null;
  supplierEmail: string | null;
  supplierContact: string | null;
  materialGroup: string;
  projectName: string;
  language: SupplierLanguage;
}

/** #RRGGBB → [r,g,b], falling back to Cantaia orange for anything unparseable. */
function hexToRgb(hex: string): [number, number, number] {
  const match = /^#?([0-9a-f]{6})$/i.exec((hex || "").trim());
  if (!match) return [249, 115, 22];
  const n = parseInt(match[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Builds the purchase order for one awarded price request.
 * Returns null when the request, its submission or its prices cannot be read —
 * the caller decides whether that is fatal (download) or not (email attachment).
 */
export async function buildPurchaseOrderPdf(
  admin: any,
  submissionId: string,
  priceRequestId: string,
  organizationId: string
): Promise<PurchaseOrder | null> {
  const { data: priceRequest } = await admin
    .from("submission_price_requests")
    .select("*, suppliers(company_name, contact_name, email)")
    .eq("id", priceRequestId)
    .eq("submission_id", submissionId)
    .maybeSingle();

  if (!priceRequest) return null;

  const { data: submission } = await admin
    .from("submissions")
    .select("id, title, deadline, project_id, projects!submissions_project_id_fkey(name, code, city, organization_id)")
    .eq("id", submissionId)
    .maybeSingle();

  // Anti-IDOR: unconditional — a submission with no project is refused.
  const project = (submission as any)?.projects;
  if (!project || project.organization_id !== organizationId) return null;

  const language = normalizeSupplierLanguage(priceRequest.language);
  const s = supplierStrings(language);

  // ── Lines: requested items priced by this supplier's quotes ──
  const { data: quotes } = await admin
    .from("submission_quotes")
    .select("item_id, unit_price_ht, total_ht")
    .eq("request_id", priceRequestId);

  const priceByItem = new Map<string, { unit: number | null; total: number | null }>();
  for (const q of quotes || []) {
    if (!q.item_id) continue;
    priceByItem.set(q.item_id, {
      unit: q.unit_price_ht != null ? Number(q.unit_price_ht) : null,
      total: q.total_ht != null ? Number(q.total_ht) : null,
    });
  }

  const requested: any[] = Array.isArray(priceRequest.items_requested)
    ? priceRequest.items_requested
    : [];

  const lines: PurchaseOrderLine[] = [];
  let totalHt = 0;

  for (const item of requested) {
    const price = priceByItem.get(item.id);
    if (!price || price.unit == null) continue; // not quoted → not ordered
    const quantity = item.quantity != null ? Number(item.quantity) : null;
    const lineTotal =
      price.total != null
        ? price.total
        : quantity != null && Number.isFinite(quantity)
          ? price.unit * quantity
          : price.unit;
    totalHt += lineTotal;
    lines.push({
      item_number: item.item_number ?? null,
      description: cleanDescriptionForSupplier(item.description || ""),
      unit: item.unit ?? null,
      quantity,
      unit_price_ht: price.unit,
      total_ht: lineTotal,
    });
  }

  const branding = await getOrgBranding(admin, organizationId);
  const [pr, pg, pb] = hexToRgb(branding.primaryColor);

  const reference = `BC-${(priceRequest.tracking_code || priceRequestId).slice(-10).toUpperCase()}`;
  const supplierName: string | null =
    priceRequest.suppliers?.company_name || priceRequest.supplier_name_manual || null;

  // ── Render ────────────────────────────────────────────────
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginX = 14;

  // Letterhead
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(pr, pg, pb);
  doc.text(branding.name, marginX, 18);

  doc.setFontSize(16);
  doc.setTextColor(24, 24, 27);
  doc.text(s.poTitle, marginX, 26);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(90, 90, 95);
  doc.text(`${s.poNumber}: ${reference}`, pageW - marginX, 16, { align: "right" });
  doc.text(
    `${s.poDate}: ${formatSupplierDate(new Date(), language) ?? ""}`,
    pageW - marginX,
    21,
    { align: "right" }
  );

  doc.setDrawColor(pr, pg, pb);
  doc.setLineWidth(0.6);
  doc.line(marginX, 30, pageW - marginX, 30);
  doc.setDrawColor(200, 200, 205);
  doc.setLineWidth(0.2);

  // Parties
  let y = 38;
  const label = (text: string, value: string, atY: number) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(110, 110, 115);
    doc.text(text, marginX, atY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(24, 24, 27);
    doc.text(value || "—", marginX, atY + 5);
  };

  label(s.poSupplier, supplierName || "—", y);
  const deliveryDate = formatSupplierDate(priceRequest.deadline || (submission as any)?.deadline, language);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(110, 110, 115);
  doc.text(s.poProject, pageW / 2, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(24, 24, 27);
  doc.text(project.code ? `${project.name} (${project.code})` : project.name || "—", pageW / 2, y + 5);

  y += 14;
  label(s.poGroup, priceRequest.material_group || "—", y);
  if (deliveryDate) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(110, 110, 115);
    doc.text(s.poDeliveryDate, pageW / 2, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(24, 24, 27);
    doc.text(deliveryDate, pageW / 2, y + 5);
  }

  y += 16;

  // Table
  const availW = pageW - marginX * 2;
  const widths = [16, availW - 16 - 16 - 20 - 24 - 26, 16, 20, 24, 26];
  const headers = [s.colNumber, s.colDescription, s.colUnit, s.colQuantity, s.colUnitPrice, s.colTotal];
  const rowH = 7;

  const drawHeader = () => {
    doc.setFillColor(240, 240, 242);
    doc.rect(marginX, y, availW, rowH, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(60, 60, 65);
    let x = marginX;
    headers.forEach((h, i) => {
      const alignRight = i >= 3;
      doc.text(h, alignRight ? x + widths[i] - 1.5 : x + 1.5, y + 4.8, {
        align: alignRight ? "right" : "left",
        maxWidth: widths[i] - 3,
      });
      x += widths[i];
    });
    y += rowH;
  };

  drawHeader();
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);

  for (const line of lines) {
    const descLines: string[] = doc.splitTextToSize(line.description || "—", widths[1] - 3);
    const cellH = Math.max(rowH, descLines.length * 3.6 + 3);

    if (y + cellH > pageH - 40) {
      doc.addPage();
      y = 18;
      drawHeader();
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
    }

    doc.setTextColor(40, 40, 45);
    const cells = [
      line.item_number || "—",
      null, // description drawn separately (multi-line)
      line.unit || "—",
      line.quantity != null ? formatSupplierNumber(line.quantity, language, 0) : "—",
      formatSupplierNumber(line.unit_price_ht, language),
      formatSupplierNumber(line.total_ht, language),
    ];

    let x = marginX;
    cells.forEach((value, i) => {
      if (i === 1) {
        descLines.forEach((dl, k) => doc.text(dl, x + 1.5, y + 4.5 + k * 3.6));
      } else {
        const alignRight = i >= 3;
        doc.text(String(value), alignRight ? x + widths[i] - 1.5 : x + 1.5, y + 4.5, {
          align: alignRight ? "right" : "left",
          maxWidth: widths[i] - 3,
        });
      }
      x += widths[i];
    });

    doc.setDrawColor(225, 225, 230);
    doc.line(marginX, y + cellH, marginX + availW, y + cellH);
    y += cellH;
  }

  // Total
  y += 4;
  if (y > pageH - 34) {
    doc.addPage();
    y = 20;
  }
  doc.setFillColor(pr, pg, pb);
  doc.rect(marginX + availW - 90, y, 90, 9, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text(s.poSubtotal, marginX + availW - 87, y + 6);
  doc.text(`${formatSupplierNumber(totalHt, language)} CHF`, marginX + availW - 3, y + 6, {
    align: "right",
  });
  y += 14;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(110, 110, 115);
  doc.text(s.poNoVat, marginX, y);

  if (priceRequest.conditions_text) {
    y += 8;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(60, 60, 65);
    doc.text(s.poConditions, marginX, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(90, 90, 95);
    const condLines: string[] = doc.splitTextToSize(String(priceRequest.conditions_text), availW);
    condLines.slice(0, 8).forEach((cl, i) => doc.text(cl, marginX, y + 5 + i * 4));
  }

  // Footer on every page
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(140, 140, 145);
    doc.text(`${branding.name} — ${s.poFooter}`, marginX, pageH - 8);
    doc.text(`${i} / ${pageCount}`, pageW - marginX, pageH - 8, { align: "right" });
  }

  const buffer = Buffer.from(doc.output("arraybuffer") as ArrayBuffer);

  return {
    buffer,
    filename: `${reference}.pdf`,
    reference,
    totalHt,
    lines,
    supplierName,
    supplierEmail: priceRequest.suppliers?.email || priceRequest.supplier_email_manual || null,
    supplierContact: priceRequest.suppliers?.contact_name || null,
    materialGroup: priceRequest.material_group || "",
    projectName: project.name || "Projet",
    language,
  };
}
