import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  loadRateContext,
  resolveOrgBranding,
  toValuedLaborLine,
  toValuedMachineLine,
  hexToRgb,
  roundChf,
} from "@cantaia/core/financials";
import { drawFooter, drawLetterhead, fetchLogoDataUrl, formatChf, wrapText } from "@/lib/site-reports-pdf";

export const maxDuration = 60;

/**
 * POST /api/site-reports/regie
 * Body: { report_id: string }
 *
 * Generates the "bon de régie" for one site report: the signed, priced sheet a
 * Swiss contractor hands to the client for work done on a time-and-materials
 * basis. Cantaia collected every input (hours, machines, delivery notes,
 * signature) and produced no such document — the foreman kept a paper duplicate
 * book alongside the app.
 *
 * The sheet carries the org letterhead and, when migration 093 has been
 * applied, the captured signatures (`site_reports.signature_data` /
 * `conductor_signature_data`); otherwise it prints empty signature boxes so the
 * document stays usable on paper.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("users")
      .select("organization_id, role, is_superadmin")
      .eq("id", user.id)
      .maybeSingle();
    if (!profile?.organization_id) return NextResponse.json({ error: "No org" }, { status: 400 });

    // The bon de régie is a priced, opposable document (rates + amounts). Same
    // policy as the valued hours / payroll export: management roles only.
    const FINANCIAL_ROLES = ["admin", "director", "project_manager"];
    if (!((profile as any).is_superadmin === true || FINANCIAL_ROLES.includes((profile as any).role))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const reportId = typeof body?.report_id === "string" ? body.report_id : null;
    if (!reportId) {
      return NextResponse.json({ error: "report_id required" }, { status: 400 });
    }

    // `*` — signature columns arrive with migration 093 and must stay optional.
    const { data: report, error: reportError } = await (admin as any)
      .from("site_reports")
      .select("*")
      .eq("id", reportId)
      .maybeSingle();

    if (reportError) {
      console.error("[Régie] Report fetch error:", reportError.message);
      return NextResponse.json({ error: "Failed to fetch report" }, { status: 500 });
    }
    if (!report) return NextResponse.json({ error: "Report not found" }, { status: 404 });

    // Anti-IDOR: the report must belong to a project of the caller's org.
    const { data: project, error: projectError } = await (admin as any)
      .from("projects")
      .select("id, name, code, address, city, client_name, organization_id")
      .eq("id", report.project_id)
      .maybeSingle();

    if (projectError) {
      console.error("[Régie] Project fetch error:", projectError.message);
      return NextResponse.json({ error: "Failed to fetch project" }, { status: 500 });
    }
    if (!project || project.organization_id !== profile.organization_id) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    const { data: entries, error: entriesError } = await (admin as any)
      .from("site_report_entries")
      .select("*, portal_crew_members(name, role)")
      .eq("report_id", reportId)
      .order("created_at", { ascending: true });

    if (entriesError) {
      console.error("[Régie] Entries fetch error:", entriesError.message);
      return NextResponse.json({ error: "Failed to fetch entries" }, { status: 500 });
    }

    const rates = await loadRateContext(admin as any, profile.organization_id, [project.id]);
    const branding = await resolveOrgBranding(admin as any, profile.organization_id);

    const ctxBase = {
      reportDate: report.report_date ?? null,
      projectId: project.id,
      projectName: project.name || "",
    };

    const laborLines = [];
    const machineLines = [];
    const deliveryNotes: Array<{ note_number: string; supplier_name: string }> = [];

    for (const e of entries || []) {
      if (e.entry_type === "labor") {
        laborLines.push(
          toValuedLaborLine(e, rates, {
            ...ctxBase,
            crewName: e.portal_crew_members?.name || e.work_description || "—",
            crewRole: e.portal_crew_members?.role || "",
          }),
        );
      } else if (e.entry_type === "machine") {
        machineLines.push(toValuedMachineLine(e, rates, ctxBase));
      } else if (e.entry_type === "delivery_note") {
        deliveryNotes.push({
          note_number: e.note_number || "—",
          supplier_name: e.supplier_name || "—",
        });
      }
    }

    const totalLaborHours = roundChf(laborLines.reduce((s, l) => s + l.hours, 0));
    const totalLaborCost = roundChf(laborLines.reduce((s, l) => s + l.amount_chf, 0));
    const totalMachineHours = roundChf(machineLines.reduce((s, l) => s + l.hours, 0));
    const totalMachineCost = roundChf(machineLines.reduce((s, l) => s + (l.amount_chf || 0), 0));
    const grandTotal = roundChf(totalLaborCost + totalMachineCost);

    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF();
    const logo = await fetchLogoDataUrl(branding.logoUrl);
    const pageWidth = doc.internal.pageSize.getWidth();
    const bottom = doc.internal.pageSize.getHeight() - 18;
    const [pr, pg, pb] = hexToRgb(branding.primaryColor);

    const formattedDate = report.report_date
      ? new Date(`${report.report_date}T00:00:00`).toLocaleDateString("fr-CH", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        })
      : "—";

    let y = drawLetterhead(doc, {
      branding,
      logo,
      title: "Bon de régie",
      subtitle: project.name || "",
      meta: [
        `Date : ${formattedDate}`,
        project.code ? `Chantier : ${project.code}` : "",
        report.submitted_by_name ? `Établi par : ${report.submitted_by_name}` : "",
      ].filter(Boolean),
    });

    // ── Site block ────────────────────────────────────────────────────────────
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    const siteLines = [
      project.client_name ? `Maître d'ouvrage : ${project.client_name}` : "",
      [project.address, project.city].filter(Boolean).join(", "),
      report.weather ? `Météo : ${report.weather}` : "",
    ].filter(Boolean);
    for (const line of siteLines) {
      doc.text(line, 14, y);
      y += 5;
    }
    if (siteLines.length) y += 3;

    const sectionHeader = (label: string, columns: Array<[string, number, boolean?]>) => {
      if (y + 16 > bottom) { doc.addPage(); y = 20; }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(pr, pg, pb);
      doc.text(label, 14, y);
      doc.setTextColor(24, 24, 27);
      y += 6;
      doc.setFontSize(8);
      for (const [text, x, right] of columns) {
        doc.text(text, x, y, right ? { align: "right" } : undefined);
      }
      y += 4;
      doc.line(14, y - 2, pageWidth - 14, y - 2);
      doc.setFont("helvetica", "normal");
    };

    // ── Labour ────────────────────────────────────────────────────────────────
    const cols = { name: 14, cfc: 78, work: 96, hours: 150, rate: 172, amount: 196 };

    sectionHeader("Main-d'œuvre", [
      ["Ouvrier", cols.name],
      ["CFC", cols.cfc],
      ["Travaux", cols.work],
      ["Heures", cols.hours, true],
      ["Taux", cols.rate, true],
      ["Montant", cols.amount, true],
    ]);

    if (laborLines.length === 0) {
      doc.text("—", cols.name, y);
      y += 5;
    }

    for (const l of laborLines) {
      const nameCell = wrapText(doc, l.crew_member_name + (l.is_driver ? " (cond.)" : ""), 60, 2);
      const workCell = wrapText(doc, l.work_description, 50, 3);
      const rowHeight = Math.max(nameCell.length, workCell.length) * 4 + 1;
      if (y + rowHeight > bottom) { doc.addPage(); y = 20; }

      nameCell.forEach((line, i) => doc.text(line, cols.name, y + i * 4));
      doc.text(l.cfc_code || "—", cols.cfc, y);
      workCell.forEach((line, i) => doc.text(line, cols.work, y + i * 4));
      doc.text(l.hours.toFixed(2), cols.hours, y, { align: "right" });
      doc.text(formatChf(l.rate_chf), cols.rate, y, { align: "right" });
      doc.text(formatChf(l.amount_chf), cols.amount, y, { align: "right" });
      y += rowHeight;
    }

    doc.setFont("helvetica", "bold");
    doc.text(`${totalLaborHours.toFixed(2)} h`, cols.hours, y + 1, { align: "right" });
    doc.text(`${formatChf(totalLaborCost)}`, cols.amount, y + 1, { align: "right" });
    y += 10;

    // ── Machines ──────────────────────────────────────────────────────────────
    if (machineLines.length > 0) {
      sectionHeader("Machines / engins", [
        ["Machine", cols.name],
        ["CFC", cols.cfc],
        ["Location", cols.work],
        ["Heures", cols.hours, true],
        ["Taux", cols.rate, true],
        ["Montant", cols.amount, true],
      ]);

      for (const l of machineLines) {
        const nameCell = wrapText(doc, l.machine_description || "—", 60, 2);
        const rowHeight = nameCell.length * 4 + 1;
        if (y + rowHeight > bottom) { doc.addPage(); y = 20; }

        nameCell.forEach((line, i) => doc.text(line, cols.name, y + i * 4));
        doc.text(l.cfc_code || "—", cols.cfc, y);
        doc.text(l.is_rented ? "Oui" : "—", cols.work, y);
        doc.text(l.hours.toFixed(2), cols.hours, y, { align: "right" });
        doc.text(l.rate_chf === null ? "—" : formatChf(l.rate_chf), cols.rate, y, { align: "right" });
        doc.text(l.amount_chf === null ? "—" : formatChf(l.amount_chf), cols.amount, y, { align: "right" });
        y += rowHeight;
      }

      doc.setFont("helvetica", "bold");
      doc.text(`${totalMachineHours.toFixed(2)} h`, cols.hours, y + 1, { align: "right" });
      doc.text(`${formatChf(totalMachineCost)}`, cols.amount, y + 1, { align: "right" });
      y += 10;
    }

    // ── Delivery notes ────────────────────────────────────────────────────────
    if (deliveryNotes.length > 0) {
      sectionHeader("Bons de livraison", [["N° Bon", cols.name], ["Fournisseur", cols.work]]);
      for (const n of deliveryNotes) {
        if (y + 6 > bottom) { doc.addPage(); y = 20; }
        doc.text(wrapText(doc, n.note_number, 58, 1)[0], cols.name, y);
        doc.text(wrapText(doc, n.supplier_name, 90, 1)[0], cols.work, y);
        y += 5;
      }
      y += 5;
    }

    // ── Total ─────────────────────────────────────────────────────────────────
    if (y + 18 > bottom) { doc.addPage(); y = 20; }
    doc.setFillColor(pr, pg, pb);
    doc.rect(14, y - 5, pageWidth - 28, 10, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Total régie", 18, y + 1.5);
    doc.text(`${formatChf(grandTotal)} CHF`, pageWidth - 18, y + 1.5, { align: "right" });
    doc.setTextColor(24, 24, 27);
    y += 14;

    // ── Remarks ───────────────────────────────────────────────────────────────
    if (report.remarks) {
      if (y + 20 > bottom) { doc.addPage(); y = 20; }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text("Remarques", 14, y);
      y += 5;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      for (const line of wrapText(doc, report.remarks, pageWidth - 28, 8)) {
        if (y + 5 > bottom) { doc.addPage(); y = 20; }
        doc.text(line, 14, y);
        y += 4.5;
      }
      y += 6;
    }

    // ── Signatures ────────────────────────────────────────────────────────────
    const boxHeight = 30;
    if (y + boxHeight + 12 > bottom) { doc.addPage(); y = 24; }

    const boxWidth = (pageWidth - 28 - 8) / 2;
    const signatures: Array<{ label: string; who: string | null; when: string | null; data: string | null }> = [
      {
        label: "Chef d'équipe",
        who: report.signed_by || report.submitted_by_name || null,
        when: report.signed_at || null,
        data: typeof report.signature_data === "string" ? report.signature_data : null,
      },
      {
        label: "Conducteur / Maître d'ouvrage",
        who: null,
        when: report.conductor_signed_at || null,
        data: typeof report.conductor_signature_data === "string" ? report.conductor_signature_data : null,
      },
    ];

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("Signatures", 14, y);
    y += 5;

    signatures.forEach((sig, index) => {
      const x = 14 + index * (boxWidth + 8);
      doc.setDrawColor(180, 180, 185);
      doc.setLineWidth(0.3);
      doc.rect(x, y, boxWidth, boxHeight);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(110, 110, 115);
      doc.text(sig.label, x + 3, y + 5);
      doc.setTextColor(24, 24, 27);

      if (sig.data && /^data:image\/(png|jpe?g);base64,/i.test(sig.data)) {
        try {
          const format = /jpe?g/i.test(sig.data) ? "JPEG" : "PNG";
          doc.addImage(sig.data, format, x + 4, y + 7, boxWidth - 8, boxHeight - 16, undefined, "FAST");
        } catch {
          /* an unreadable signature must not break the sheet */
        }
      }

      doc.setFontSize(7);
      doc.setTextColor(110, 110, 115);
      const footer = [
        sig.who || "",
        sig.when
          ? new Date(sig.when).toLocaleDateString("fr-CH", { day: "2-digit", month: "2-digit", year: "numeric" })
          : "",
      ]
        .filter(Boolean)
        .join(" — ");
      doc.text(footer || "Date et signature", x + 3, y + boxHeight - 3);
      doc.setTextColor(24, 24, 27);
    });

    drawFooter(doc, `${branding.name} — bon de régie`);

    const pdfBuffer = Buffer.from(doc.output("arraybuffer"));
    const safeCode = String(project.code || project.name || "chantier").replace(/[^a-zA-Z0-9._-]/g, "_");

    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="regie_${safeCode}_${report.report_date || "sans-date"}.pdf"`,
      },
    });
  } catch (error) {
    console.error("[Régie] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
