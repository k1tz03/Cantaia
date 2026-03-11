import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getValidMicrosoftToken } from "@/lib/microsoft/tokens";
import { randomBytes } from "crypto";

interface SendRequest {
  groups: Array<{
    material_group: string;
    supplier_ids: string[];
  }>;
  deadline?: string;
  language?: "fr" | "en" | "de";
  attachment_urls?: string[];
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: submissionId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();
    const body: SendRequest = await request.json();

    // Get submission with project info
    const { data: submission } = await admin
      .from("submissions")
      .select("*, projects(id, name, code, client_name, city)")
      .eq("id", submissionId)
      .maybeSingle();

    if (!submission) return NextResponse.json({ error: "Submission not found" }, { status: 404 });

    // Get user profile for email signature (cast: job_title from migration 041)
    const { data: userProfile } = await (admin as any)
      .from("users")
      .select("first_name, last_name, email, organization_id, job_title")
      .eq("id", user.id)
      .maybeSingle();

    if (!userProfile) return NextResponse.json({ error: "User profile not found" }, { status: 400 });

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

    // Get Microsoft token for sending emails
    const tokenResult = await getValidMicrosoftToken(user.id);
    const canSendEmail = !("error" in tokenResult);

    const results: Array<{
      material_group: string;
      supplier_id: string;
      tracking_code: string;
      status: "sent" | "saved";
      error?: string;
    }> = [];

    for (const group of body.groups) {
      const groupItems = itemsByGroup[group.material_group] || [];
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

        // Get supplier info
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

        // Create price request record
        const { error: insertError } = await (admin as any)
          .from("submission_price_requests")
          .insert({
            submission_id: submissionId,
            project_id: submission.project_id,
            supplier_id: supplierId,
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
            sent_at: new Date().toISOString(),
            status: "sent",
          });

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
            const emailBody = generatePriceRequestEmail({
              supplierName: supplier.company_name,
              contactName: supplier.contact_name,
              projectName,
              materialGroup: group.material_group,
              items: groupItems,
              trackingCode,
              deadline: body.deadline,
              senderName: `${userProfile.first_name} ${userProfile.last_name}`,
              senderCompany: org?.name || "",
              senderTitle: userProfile.job_title,
              language: body.language || "fr",
            });

            await sendEmailViaGraph(
              tokenResult.accessToken,
              supplier.email,
              emailBody.subject,
              emailBody.html,
              userProfile.email,
              body.attachment_urls
            );

            results.push({
              material_group: group.material_group,
              supplier_id: supplierId,
              tracking_code: trackingCode,
              status: "sent",
            });
          } catch (emailError: any) {
            console.error("[send-price-requests] Email error:", emailError);
            results.push({
              material_group: group.material_group,
              supplier_id: supplierId,
              tracking_code: trackingCode,
              status: "saved",
              error: `Email failed: ${emailError.message}`,
            });
          }
        } else {
          results.push({
            material_group: group.material_group,
            supplier_id: supplierId,
            tracking_code: trackingCode,
            status: "saved",
            error: "Microsoft not connected — request saved but not emailed",
          });
        }
      }
    }

    const sentCount = results.filter((r) => r.status === "sent").length;
    const savedCount = results.filter((r) => r.status === "saved").length;

    return NextResponse.json({
      success: true,
      sent: sentCount,
      saved: savedCount,
      results,
    });

  } catch (err: any) {
    console.error("[send-price-requests] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
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
}) {
  const greeting = opts.contactName ? `Madame, Monsieur ${opts.contactName}` : "Madame, Monsieur";
  const deadlineStr = opts.deadline
    ? new Date(opts.deadline).toLocaleDateString("fr-CH", { day: "numeric", month: "long", year: "numeric" })
    : "dans les meilleurs délais";

  const itemsTable = opts.items
    .map((i) => `<tr><td style="padding:4px 8px;border:1px solid #ddd;">${i.item_number || "-"}</td><td style="padding:4px 8px;border:1px solid #ddd;">${i.description}</td><td style="padding:4px 8px;border:1px solid #ddd;text-align:center;">${i.unit || "-"}</td><td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">${i.quantity != null ? Number(i.quantity).toLocaleString("fr-CH") : "-"}</td></tr>`)
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

<p>Cordialement,<br/>
<strong>${opts.senderName}</strong>${opts.senderTitle ? `<br/>${opts.senderTitle}` : ""}<br/>
${opts.senderCompany}</p>
`.trim();

  return { subject, html };
}

async function sendEmailViaGraph(
  accessToken: string,
  to: string,
  subject: string,
  htmlBody: string,
  from: string,
  _attachmentUrls?: string[]
) {
  const message: any = {
    subject,
    body: { contentType: "HTML", content: htmlBody },
    toRecipients: [{ emailAddress: { address: to } }],
    from: { emailAddress: { address: from } },
  };

  // Note: attachment handling for Graph API would require downloading from Storage
  // and converting to base64. Simplified for now.

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
