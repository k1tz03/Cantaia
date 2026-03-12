import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/submissions/[id]/preview-email?group=Béton&supplier_id=xxx
 * Returns email preview: { subject, body, to, tracking_code }
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: submissionId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();

    const group = request.nextUrl.searchParams.get("group");
    const supplierId = request.nextUrl.searchParams.get("supplier_id");
    const deadline = request.nextUrl.searchParams.get("deadline");
    // Manual supplier data passed as query params when supplier is temp
    const manualName = request.nextUrl.searchParams.get("manual_name");
    const manualEmail = request.nextUrl.searchParams.get("manual_email");
    const manualContact = request.nextUrl.searchParams.get("manual_contact");

    if (!group || !supplierId) {
      return NextResponse.json({ error: "group and supplier_id required" }, { status: 400 });
    }

    // Get submission with project info
    const { data: submission } = await admin
      .from("submissions")
      .select("*, projects(id, name, code, client_name, city, organization_id)")
      .eq("id", submissionId)
      .maybeSingle();

    if (!submission) return NextResponse.json({ error: "Submission not found" }, { status: 404 });

    // Verify submission's project belongs to user's org (checked after userProfile fetch below)

    // Get supplier — from DB or manual params
    const isManual = supplierId.startsWith("temp-");
    let supplier: { company_name: string; contact_name: string | null; email: string | null };

    if (isManual) {
      supplier = {
        company_name: manualName || "Fournisseur",
        contact_name: manualContact || null,
        email: manualEmail || null,
      };
    } else {
      const { data: dbSupplier } = await admin
        .from("suppliers")
        .select("company_name, contact_name, email")
        .eq("id", supplierId)
        .maybeSingle();

      if (!dbSupplier) return NextResponse.json({ error: "Supplier not found" }, { status: 404 });
      supplier = dbSupplier;
    }

    // Get user profile
    const { data: userProfile } = await (admin as any)
      .from("users")
      .select("first_name, last_name, email, organization_id, job_title")
      .eq("id", user.id)
      .maybeSingle();

    // Verify submission's project belongs to user's org
    const proj = (submission as any).projects;
    if (proj && userProfile?.organization_id && proj.organization_id !== userProfile.organization_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get org name
    const { data: org } = await admin
      .from("organizations")
      .select("name")
      .eq("id", userProfile?.organization_id)
      .maybeSingle();

    // Get items for this group
    const { data: allItems } = await (admin as any)
      .from("submission_items")
      .select("*")
      .eq("submission_id", submissionId);

    const groupItems = (allItems || []).filter((i: any) => i.material_group === group);

    // Generate preview tracking code
    const shortId = submissionId.slice(0, 4).toUpperCase();
    const groupSlug = group
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "-")
      .slice(0, 15);
    const trackingCode = `SUB-${shortId}-${groupSlug}-XXXXXX`;

    const projectName = (submission as any).projects?.name || "Projet";
    const contactFirstName = supplier.contact_name?.split(/\s+/)[0] || null;
    const greeting = contactFirstName ? `Bonjour ${contactFirstName}` : "Bonjour";
    const deadlineStr = deadline
      ? new Date(deadline).toLocaleDateString("fr-CH", { day: "numeric", month: "long", year: "numeric" })
      : "dans les meilleurs délais";

    const itemsTable = groupItems
      .map((i: any) => `<tr><td style="padding:4px 8px;border:1px solid #ddd;">${i.item_number || "-"}</td><td style="padding:4px 8px;border:1px solid #ddd;">${i.description}</td><td style="padding:4px 8px;border:1px solid #ddd;text-align:center;">${i.unit || "-"}</td><td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">${i.quantity != null ? Number(i.quantity).toLocaleString("fr-CH") : "-"}</td></tr>`)
      .join("\n");

    const subject = `Demande de prix — ${projectName} — ${group}`;
    const senderName = `${userProfile?.first_name || ""} ${userProfile?.last_name || ""}`.trim();

    const html = `
<p>${greeting},</p>

<p>Dans le cadre du projet <strong>${projectName}</strong>, nous vous sollicitons pour une offre de prix concernant les postes suivants (<strong>${group}</strong>) :</p>

<table style="border-collapse:collapse;width:100%;font-size:13px;margin:16px 0;">
  <thead>
    <tr style="background:#f3f4f6;">
      <th style="padding:6px 8px;border:1px solid #ddd;text-align:left;">N°</th>
      <th style="padding:6px 8px;border:1px solid #ddd;text-align:left;">Description</th>
      <th style="padding:6px 8px;border:1px solid #ddd;text-align:center;">Unité</th>
      <th style="padding:6px 8px;border:1px solid #ddd;text-align:right;">Quantité</th>
    </tr>
  </thead>
  <tbody>
    ${itemsTable}
  </tbody>
</table>

<p>Merci de nous transmettre votre offre de prix unitaires HT pour ces postes, <strong>avant le ${deadlineStr}</strong>.</p>

<p style="background:#f0f9ff;padding:12px;border-radius:6px;border-left:4px solid #3b82f6;margin:16px 0;">
  <strong>Important :</strong> Merci de mentionner le code <strong>${trackingCode}</strong> dans votre réponse ou en objet de mail, afin de faciliter le traitement de votre offre.
</p>

<p>Nous restons à votre disposition pour tout renseignement complémentaire.</p>

<p>Cordialement,<br/>
<strong>${senderName}</strong>${userProfile?.job_title ? `<br/>${userProfile.job_title}` : ""}<br/>
${org?.name || ""}</p>
`.trim();

    // Generate plain text table for editable textarea
    const colWidths = { num: 6, desc: 40, unit: 8, qty: 10 };
    const pad = (s: string, w: number) => s.length >= w ? s.slice(0, w) : s + " ".repeat(w - s.length);
    const padR = (s: string, w: number) => s.length >= w ? s.slice(0, w) : " ".repeat(w - s.length) + s;
    const separator = "-".repeat(colWidths.num + colWidths.desc + colWidths.unit + colWidths.qty + 9);
    const textTableLines = [
      `${pad("N°", colWidths.num)} | ${pad("Description", colWidths.desc)} | ${pad("Unité", colWidths.unit)} | ${padR("Quantité", colWidths.qty)}`,
      separator,
      ...groupItems.map((i: any) => {
        const num = (i.item_number || "-").slice(0, colWidths.num);
        const desc = (i.description || "").slice(0, colWidths.desc);
        const unit = (i.unit || "-").slice(0, colWidths.unit);
        const qty = i.quantity != null ? Number(i.quantity).toLocaleString("fr-CH") : "-";
        return `${pad(num, colWidths.num)} | ${pad(desc, colWidths.desc)} | ${pad(unit, colWidths.unit)} | ${padR(qty, colWidths.qty)}`;
      }),
    ];
    const textTable = textTableLines.join("\n");

    // Generate plain text version for editable textarea
    const bodyText = [
      `${greeting},`,
      `Dans le cadre du projet ${projectName}, nous vous sollicitons pour une offre de prix concernant les postes suivants (${group}) :`,
      textTable,
      `Merci de nous transmettre votre offre de prix unitaires HT pour ces postes, avant le ${deadlineStr}.`,
      `Nous restons à votre disposition pour tout renseignement complémentaire.`,
      `Cordialement,\n${senderName}${userProfile?.job_title ? `\n${userProfile.job_title}` : ""}\n${org?.name || ""}`,
    ].join("\n\n").trim();

    return NextResponse.json({
      success: true,
      subject,
      body: html,
      body_text: bodyText,
      to: supplier.email,
      supplier_name: supplier.company_name,
      tracking_code: trackingCode,
      items_count: groupItems.length,
    });
  } catch (err: any) {
    console.error("[preview-email] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
