import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getValidMicrosoftToken } from "@/lib/microsoft/tokens";
import { randomBytes } from "crypto";

interface ManualSupplierInfo {
  id: string;
  company_name: string;
  email: string;
  contact_name?: string;
}

interface AttachmentData {
  filename: string;
  contentType: string;
  content: string; // base64
}

interface SendRequest {
  groups: Array<{
    material_group: string;
    supplier_ids: string[];
    item_ids?: string[]; // Cross-category: if present, use these specific items instead of all group items
  }>;
  deadline?: string;
  language?: "fr" | "en" | "de";
  attachment_urls?: string[];
  attachments?: AttachmentData[]; // inline base64 attachments (global, sent with every email)
  group_attachments?: Record<string, AttachmentData[]>; // per-group attachments (keyed by material_group name)
  custom_subject?: string;
  custom_body?: string;
  custom_bodies?: Record<string, string>; // per-supplier body overrides (supplier_id → body text)
  custom_subjects?: Record<string, string>; // per-supplier subject overrides (supplier_id → subject)
  manual_suppliers?: ManualSupplierInfo[];
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: submissionId } = await params;
    console.log("[SEND] Starting send-price-requests for submission:", submissionId);

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.log("[SEND] User ID:", user.id);

    const admin = createAdminClient();
    const body: SendRequest = await request.json();
    console.log("[SEND] Request body:", { groups: body.groups.length, deadline: body.deadline, hasCustomSubject: !!body.custom_subject, hasCustomBody: !!body.custom_body });

    // Get submission with project info
    const { data: submission } = await admin
      .from("submissions")
      .select("*, projects!submissions_project_id_fkey(id, name, code, client_name, city)")
      .eq("id", submissionId)
      .maybeSingle();

    if (!submission) return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    console.log("[SEND] Submission found:", submission.id, "project:", (submission as any).projects?.name);

    // Get user profile for email signature (cast: job_title from migration 041)
    const { data: userProfile } = await (admin as any)
      .from("users")
      .select("first_name, last_name, email, organization_id, job_title, email_signature")
      .eq("id", user.id)
      .maybeSingle();

    if (!userProfile) return NextResponse.json({ error: "User profile not found" }, { status: 400 });
    console.log("[SEND] User profile:", userProfile.email, "org:", userProfile.organization_id);

    // Verify org ownership: submission's project must belong to user's org
    const { data: projCheck } = await admin
      .from("projects")
      .select("organization_id")
      .eq("id", submission.project_id)
      .maybeSingle();
    if (!projCheck || projCheck.organization_id !== userProfile.organization_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get org name
    const { data: org } = await admin
      .from("organizations")
      .select("name")
      .eq("id", userProfile.organization_id)
      .maybeSingle();

    // Get all items grouped by material_group (cast: migration 049 tables)
    const { data: allItems } = await (admin as any)
      .from("submission_items")
      .select("*")
      .eq("submission_id", submissionId);

    const itemsByGroup: Record<string, any[]> = {};
    for (const item of allItems || []) {
      const group = item.material_group || "Divers";
      if (!itemsByGroup[group]) itemsByGroup[group] = [];
      itemsByGroup[group].push(item);
    }
    console.log("[SEND] Items by group:", Object.entries(itemsByGroup).map(([g, items]) => `${g}: ${items.length}`).join(", "));

    // Get Microsoft token for sending emails
    console.log("[SEND] Fetching Microsoft token for user:", user.id);
    const tokenResult = await getValidMicrosoftToken(user.id);
    const canSendEmail = !("error" in tokenResult);
    let microsoftError: string | null = null;

    if (!canSendEmail) {
      const errorMsg = "error" in tokenResult ? tokenResult.error : "Unknown token error";
      console.error("[SEND] Microsoft token error:", errorMsg);
      microsoftError = "Connexion Microsoft requise — reconnectez votre compte dans Paramètres → Intégrations";
    } else {
      console.log("[SEND] Microsoft token OK, token expires:", (tokenResult as any).expiresAt || "unknown");
    }

    const results: Array<{
      material_group: string;
      supplier_id: string;
      tracking_code: string;
      status: "sent" | "saved";
      error?: string;
    }> = [];

    for (const group of body.groups) {
      // Cross-category: if item_ids specified, use those; otherwise use all items in the group
      const groupItems = group.item_ids
        ? (allItems || []).filter((i: any) => group.item_ids!.includes(i.id))
        : (itemsByGroup[group.material_group] || []);
      if (groupItems.length === 0) continue;

      for (const supplierId of group.supplier_ids) {
        // Generate tracking code
        const shortId = submissionId.slice(0, 4).toUpperCase();
        const groupSlug = group.material_group
          .toLowerCase()
          .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9]/g, "-")
          .slice(0, 15);
        const random = randomBytes(3).toString("hex").toUpperCase();
        const trackingCode = `SUB-${shortId}-${groupSlug}-${random}`;

        // Check if this is a manual (temp) supplier
        const isManual = supplierId.startsWith("temp-");
        const manualInfo = isManual
          ? (body.manual_suppliers || []).find((m) => m.id === supplierId)
          : null;

        // Get supplier info — from DB or manual data
        let supplierEmail: string | null = null;
        let supplierCompanyName = "";
        let supplierContactName: string | null = null;

        if (isManual && manualInfo) {
          supplierEmail = manualInfo.email;
          supplierCompanyName = manualInfo.company_name;
          supplierContactName = manualInfo.contact_name || null;
          console.log("[SEND] Manual supplier:", supplierCompanyName, supplierEmail);
        } else {
          const { data: supplier } = await admin
            .from("suppliers")
            .select("company_name, contact_name, email")
            .eq("id", supplierId)
            .maybeSingle();

          if (!supplier?.email) {
            results.push({
              material_group: group.material_group,
              supplier_id: supplierId,
              tracking_code: trackingCode,
              status: "saved",
              error: "Supplier has no email",
            });
            continue;
          }
          supplierEmail = supplier.email;
          supplierCompanyName = supplier.company_name;
          supplierContactName = supplier.contact_name;
        }

        if (!supplierEmail) {
          results.push({
            material_group: group.material_group,
            supplier_id: supplierId,
            tracking_code: trackingCode,
            status: "saved",
            error: "Supplier has no email",
          });
          continue;
        }

        // Create price request record
        const insertData: Record<string, unknown> = {
          submission_id: submissionId,
          project_id: submission.project_id,
          tracking_code: trackingCode,
          material_group: group.material_group,
          items_requested: groupItems.map((i: any) => ({
            id: i.id,
            item_number: i.item_number,
            description: i.description,
            unit: i.unit,
            quantity: i.quantity,
          })),
          attachments: body.attachment_urls || [],
          deadline: body.deadline || null,
          sent_at: new Date().toISOString(),
          status: "sent",
        };

        if (isManual) {
          // Manual supplier — no FK, store name/email directly
          insertData.supplier_id = null;
          insertData.supplier_name_manual = supplierCompanyName;
          insertData.supplier_email_manual = supplierEmail;
        } else {
          insertData.supplier_id = supplierId;
        }

        const { error: insertError } = await (admin as any)
          .from("submission_price_requests")
          .insert(insertData);

        if (insertError) {
          results.push({
            material_group: group.material_group,
            supplier_id: supplierId,
            tracking_code: trackingCode,
            status: "saved",
            error: insertError.message,
          });
          continue;
        }

        // Generate and send email
        if (canSendEmail) {
          try {
            const projectName = (submission as any).projects?.name || "Projet";

            let subject: string;
            let htmlContent: string;

            // Check per-supplier overrides, then global fallbacks
            const effectiveCustomBody = body.custom_bodies?.[supplierId] || body.custom_body;
            const effectiveCustomSubject = body.custom_subjects?.[supplierId] || body.custom_subject;

            if (effectiveCustomBody) {
              // Use custom content from editable preview
              subject = effectiveCustomSubject || `Demande de prix — ${projectName} — ${group.material_group}`;
              const itemsTableHtml = generateItemsTableHtml(groupItems);
              htmlContent = customBodyToHtml(effectiveCustomBody, itemsTableHtml, trackingCode);
              // Append user signature if available
              if (userProfile.email_signature?.trim()) {
                htmlContent += `<br/><p>--<br/>${userProfile.email_signature.replace(/\n/g, "<br/>")}</p>`;
              }
              console.log("[SEND] Using custom email body for supplier:", supplierEmail);
            } else {
              const emailBody = generatePriceRequestEmail({
                supplierName: supplierCompanyName,
                contactName: supplierContactName,
                projectName,
                materialGroup: group.material_group,
                items: groupItems,
                trackingCode,
                deadline: body.deadline,
                senderName: `${userProfile.first_name} ${userProfile.last_name}`,
                senderCompany: org?.name || "",
                senderTitle: userProfile.job_title,
                language: body.language || "fr",
                emailSignature: userProfile.email_signature || "",
              });
              subject = effectiveCustomSubject || emailBody.subject;
              htmlContent = emailBody.html;
            }

            // Merge global attachments + per-group attachments
            const globalAttachments = body.attachments || [];
            const perGroupAttachments = body.group_attachments?.[group.material_group] || [];
            const mergedAttachments = [...globalAttachments, ...perGroupAttachments];

            console.log("[SEND] Sending email to:", supplierEmail, "subject:", subject, "attachments:", mergedAttachments.length, "(global:", globalAttachments.length, "+ group:", perGroupAttachments.length, ")");
            await sendEmailViaGraph(
              tokenResult.accessToken,
              supplierEmail,
              subject,
              htmlContent,
              userProfile.email,
              mergedAttachments.length > 0 ? mergedAttachments : undefined
            );
            console.log("[SEND] Email sent successfully to:", supplierEmail);

            results.push({
              material_group: group.material_group,
              supplier_id: supplierId,
              tracking_code: trackingCode,
              status: "sent",
            });
          } catch (emailError: any) {
            console.error("[SEND] Email error for supplier:", supplierEmail, "error:", emailError.message, "stack:", emailError.stack);
            results.push({
              material_group: group.material_group,
              supplier_id: supplierId,
              tracking_code: trackingCode,
              status: "saved",
              error: `Échec d'envoi: ${emailError.message}`,
            });
          }
        } else {
          console.warn("[SEND] Skipping email (no Microsoft token) for supplier:", supplierEmail);
          results.push({
            material_group: group.material_group,
            supplier_id: supplierId,
            tracking_code: trackingCode,
            status: "saved",
            error: microsoftError || "Microsoft non connecté — demande enregistrée mais non envoyée",
          });
        }
      }
    }

    const sentCount = results.filter((r) => r.status === "sent").length;
    const savedCount = results.filter((r) => r.status === "saved").length;
    console.log("[SEND] Done. Sent:", sentCount, "Saved:", savedCount);

    return NextResponse.json({
      success: true,
      sent: sentCount,
      saved: savedCount,
      results,
      ...(microsoftError ? { microsoft_error: microsoftError } : {}),
    });

  } catch (err: any) {
    console.error("[SEND] Fatal error:", err.message, "stack:", err.stack);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * Clean item description for supplier emails.
 * Strips service/labor phrases that are irrelevant to the supplier — they only need
 * to quote the material/product part. Swiss construction descriptions often include
 * "fourniture et pose", "livraison et mise en place", "y compris X" etc.
 */
function cleanDescriptionForSupplier(desc: string): string {
  let cleaned = desc;
  cleaned = cleaned.replace(/^(?:fourniture\s+et\s+(?:pose|mise\s+en\s+(?:place|œuvre|oeuvre))\s+(?:de\s+|d[''])?)/i, "");
  cleaned = cleaned.replace(/^(?:livraison\s+et\s+(?:pose|mise\s+en\s+(?:place|œuvre|oeuvre))\s+(?:de\s+|d[''])?)/i, "");
  cleaned = cleaned.replace(/^(?:fourniture,?\s+(?:transport\s+et\s+)?(?:pose|mise\s+en\s+(?:place|œuvre|oeuvre))\s+(?:de\s+|d[''])?)/i, "");
  cleaned = cleaned.replace(/^(?:Lieferung\s+und\s+(?:Montage|Verlegung|Einbau)\s+(?:von\s+)?)/i, "");
  cleaned = cleaned.replace(/[,;]\s*(?:y\s+compris|incl(?:us|uant)?|inkl(?:usive)?|einschliesslich)\s+.{0,80}$/i, "");
  cleaned = cleaned.replace(/\s+et\s+(?:pose|mise\s+en\s+(?:place|œuvre|oeuvre))$/i, "");
  cleaned = cleaned.replace(/\s+und\s+(?:Montage|Verlegung|Einbau)$/i, "");
  cleaned = cleaned.trim();
  if (cleaned.length > 0) cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  return cleaned.length >= 10 ? cleaned : desc;
}

function generatePriceRequestEmail(opts: {
  supplierName: string;
  contactName: string | null;
  projectName: string;
  materialGroup: string;
  items: any[];
  trackingCode: string;
  deadline?: string;
  senderName: string;
  senderCompany: string;
  senderTitle: string | null;
  language: "fr" | "en" | "de";
  emailSignature?: string;
}) {
  const contactFirstName = opts.contactName?.split(/\s+/)[0] || null;
  const greeting = contactFirstName ? `Bonjour ${contactFirstName}` : "Bonjour";
  const deadlineStr = opts.deadline
    ? new Date(opts.deadline).toLocaleDateString("fr-CH", { day: "numeric", month: "long", year: "numeric" })
    : "dans les meilleurs délais";

  const itemsTable = opts.items
    .map((i) => `<tr><td style="padding:4px 8px;border:1px solid #ddd;">${i.item_number || "-"}</td><td style="padding:4px 8px;border:1px solid #ddd;">${cleanDescriptionForSupplier(i.description)}</td><td style="padding:4px 8px;border:1px solid #ddd;text-align:center;">${i.unit || "-"}</td><td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">${i.quantity != null ? Number(i.quantity).toLocaleString("fr-CH") : "-"}</td></tr>`)
    .join("\n");

  const subject = `Demande de prix — ${opts.projectName} — ${opts.materialGroup}`;

  const html = `
<p>${greeting},</p>

<p>Dans le cadre du projet <strong>${opts.projectName}</strong>, nous vous sollicitons pour une offre de prix concernant les postes suivants (<strong>${opts.materialGroup}</strong>) :</p>

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
  <strong>Important :</strong> Merci de mentionner le code <strong>${opts.trackingCode}</strong> dans votre réponse ou en objet de mail, afin de faciliter le traitement de votre offre.
</p>

<p>Nous restons à votre disposition pour tout renseignement complémentaire.</p>

${opts.emailSignature?.trim()
    ? `<p>--<br/>${opts.emailSignature.replace(/\n/g, "<br/>")}</p>`
    : `<p>Cordialement,<br/>
<strong>${opts.senderName}</strong>${opts.senderTitle ? `<br/>${opts.senderTitle}` : ""}<br/>
${opts.senderCompany}</p>`}
`.trim();

  return { subject, html };
}

function generateItemsTableHtml(items: any[]): string {
  const rows = items
    .map((i) => `<tr><td style="padding:4px 8px;border:1px solid #ddd;">${i.item_number || "-"}</td><td style="padding:4px 8px;border:1px solid #ddd;">${cleanDescriptionForSupplier(i.description)}</td><td style="padding:4px 8px;border:1px solid #ddd;text-align:center;">${i.unit || "-"}</td><td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">${i.quantity != null ? Number(i.quantity).toLocaleString("fr-CH") : "-"}</td></tr>`)
    .join("\n");

  return `<table style="border-collapse:collapse;width:100%;font-size:13px;margin:16px 0;">
  <thead>
    <tr style="background:#f3f4f6;">
      <th style="padding:6px 8px;border:1px solid #ddd;text-align:left;">N°</th>
      <th style="padding:6px 8px;border:1px solid #ddd;text-align:left;">Description</th>
      <th style="padding:6px 8px;border:1px solid #ddd;text-align:center;">Unité</th>
      <th style="padding:6px 8px;border:1px solid #ddd;text-align:right;">Quantité</th>
    </tr>
  </thead>
  <tbody>
    ${rows}
  </tbody>
</table>`;
}

function customBodyToHtml(text: string, itemsTableHtml: string, trackingCode: string): string {
  const TABLE_MARKER = "[TABLEAU AUTOMATIQUE]";
  const paragraphs = text.split("\n\n");

  // Detect text table: starts with "N°" header line and contains "---" separator
  function isTextTable(block: string): boolean {
    const lines = block.trim().split("\n");
    if (lines.length < 3) return false;
    return (lines[0].includes("N°") && lines[0].includes("Description") && lines[1].startsWith("---"));
  }

  const htmlParts = paragraphs
    .map((p) => {
      const trimmed = p.trim();
      if (!trimmed) return "";
      if (trimmed === TABLE_MARKER) return itemsTableHtml;
      if (isTextTable(trimmed)) return itemsTableHtml;
      const content = trimmed.replace(/\n/g, "<br/>");
      return `<p>${content}</p>`;
    })
    .filter(Boolean);

  // Auto-append tracking code box
  htmlParts.push(
    `<p style="background:#f0f9ff;padding:12px;border-radius:6px;border-left:4px solid #3b82f6;margin:16px 0;"><strong>Important :</strong> Merci de mentionner le code <strong>${trackingCode}</strong> dans votre réponse ou en objet de mail, afin de faciliter le traitement de votre offre.</p>`
  );

  return htmlParts.join("\n\n");
}

async function sendEmailViaGraph(
  accessToken: string,
  to: string,
  subject: string,
  htmlBody: string,
  from: string,
  attachments?: AttachmentData[]
) {
  const message: any = {
    subject,
    body: { contentType: "HTML", content: htmlBody },
    toRecipients: [{ emailAddress: { address: to } }],
    from: { emailAddress: { address: from } },
  };

  if (attachments && attachments.length > 0) {
    message.attachments = attachments.map((a) => ({
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: a.filename,
      contentType: a.contentType,
      contentBytes: a.content,
    }));
  }

  const response = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message, saveToSentItems: true }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Graph API error ${response.status}: ${errorText}`);
  }
}
