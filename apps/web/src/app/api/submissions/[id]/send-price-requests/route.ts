import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getValidMicrosoftToken } from "@/lib/microsoft/tokens";
import { getAppUrl } from "@/lib/env";
import { randomBytes } from "crypto";
import {
  buildPortalUrl,
  buildPriceRequestEmail,
  generatePortalToken,
  normalizeSupplierLanguage,
  renderItemsTable,
  renderPortalBlock,
  supplierStrings,
  escapeHtml,
  type SupplierLanguage,
} from "@cantaia/core/submissions";

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
  /**
   * Per-supplier body overrides. Two shapes are accepted:
   *   - legacy flat:      { [supplier_id]: body }                        (one body per supplier)
   *   - per (supplier, lot): { [supplier_id]: { [material_group]: body } } (current client)
   * The flat shape silently reused ONE body for every lot of a supplier, so a
   * text edited for "Béton" also went out for "Ferblanterie".
   */
  custom_bodies?: Record<string, string | Record<string, string>>;
  /** Per-supplier subject overrides — same two shapes as custom_bodies. */
  custom_subjects?: Record<string, string | Record<string, string>>;
  manual_suppliers?: ManualSupplierInfo[];
}

/** Resolves a per-supplier override for one lot, accepting both payload shapes. */
function resolveOverride(
  entry: string | Record<string, string> | undefined,
  materialGroup: string
): string | undefined {
  if (entry === undefined || entry === null) return undefined;
  if (typeof entry === "string") return entry || undefined;
  const value = entry[materialGroup];
  return typeof value === "string" && value ? value : undefined;
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

    // H2: `sent` now means "Microsoft Graph accepted the message".
    //   - "sent"    → email left the mailbox, sent_at is set
    //   - "failed"  → the record exists but no email went out (error explains why)
    //   - "skipped" → this (supplier, lot) pair was already served by a previous
    //                 send — a retry after a partial failure must not double-email
    const results: Array<{
      material_group: string;
      supplier_id: string;
      supplier_name?: string;
      tracking_code: string;
      status: "sent" | "failed" | "skipped";
      reason?: string;
      error?: string;
    }> = [];

    // F1: the supplier-facing language drives BOTH the email copy and the
    // portal page. It used to be accepted in the payload and then ignored, so a
    // German supplier received French — on a market that is 70 % German-speaking.
    const language: SupplierLanguage = normalizeSupplierLanguage(body.language);

    // Canonical app URL (BASE_DOMAIN → NEXT_PUBLIC_APP_URL → cantaia.io).
    const appUrl = getAppUrl();
    let portalDisabledReason: string | null = null;
    if (!appUrl) {
      console.warn(
        "[SEND] portail désactivé : NEXT_PUBLIC_APP_URL manquante — les emails partent sans lien portail"
      );
      portalDisabledReason = "app_url_missing";
    }

    // Migration 099 adds `portal_token` / `language`. Until it is applied the
    // insert would fail on an unknown column, so the first such failure disables
    // those columns for the rest of this run and the emails degrade to "reply by
    // email" — which is exactly the pre-portal behaviour. NB: this flag tracks
    // SCHEMA availability only — a missing app URL no longer prevents the
    // supplier language (and token) from being persisted.
    let portalColumnsAvailable = true;

    // Migration 104 adds `sent_by` (who to notify when the offer arrives).
    let sentByColumnAvailable = true;

    // Idempotence: pairs (supplier, lot) already served by a previous run.
    // A re-POST after a partial failure re-sends ONLY what actually failed.
    const { data: alreadySentRows, error: alreadySentError } = await (admin as any)
      .from("submission_price_requests")
      .select("supplier_id, supplier_email_manual, material_group")
      .eq("submission_id", submissionId)
      .eq("status", "sent");
    if (alreadySentError) {
      console.warn("[SEND] already-sent lookup failed (idempotence skipped):", alreadySentError.message);
    }
    const alreadySentKeys = new Set<string>(
      (alreadySentRows || []).map(
        (r: any) =>
          `${r.supplier_id || (r.supplier_email_manual || "").toLowerCase()}|${r.material_group || ""}`
      )
    );

    /**
     * Marks a price request as failed. Kept tolerant of a database where
     * migration 082 (widened status CHECK + send_error column) is not applied yet.
     */
    const markFailed = async (requestId: string | null, message: string) => {
      if (!requestId) return;
      const { error } = await (admin as any)
        .from("submission_price_requests")
        .update({ status: "failed", send_error: message.slice(0, 500) })
        .eq("id", requestId);
      if (error) {
        console.warn(
          "[SEND] Could not persist failed status (apply migration 082):",
          error.message
        );
      }
    };

    for (const group of body.groups) {
      // Cross-category: if item_ids specified, use those; otherwise use all items in the group
      const groupItems = group.item_ids
        ? (allItems || []).filter((i: any) => group.item_ids!.includes(i.id))
        : (itemsByGroup[group.material_group] || []);
      if (groupItems.length === 0) continue;

      for (const supplierId of group.supplier_ids) {
        // Generate tracking code
        const shortId = submissionId.slice(0, 4).toUpperCase();
        // Slug jamais vide (un material_group vide produisait SUB-XXXX--RANDOM,
        // ind\u00e9tectable par la regex d'extraction) ; 64 bits d'al\u00e9a \u2014 le code
        // circule par email et sert de capability de rattachement.
        const groupSlug = (group.material_group || "lot")
          .toLowerCase()
          .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9]/g, "-")
          .slice(0, 15) || "lot";
        const random = randomBytes(8).toString("hex").toUpperCase();
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
          // Org-scoped lookup — a supplier id from another org must never
          // receive this org's price request (anti-IDOR).
          const { data: supplier } = await admin
            .from("suppliers")
            .select("company_name, contact_name, email")
            .eq("id", supplierId)
            .eq("organization_id", userProfile.organization_id)
            .maybeSingle();

          if (!supplier) {
            results.push({
              material_group: group.material_group,
              supplier_id: supplierId,
              tracking_code: trackingCode,
              status: "failed",
              error: "Fournisseur introuvable",
            });
            continue;
          }
          if (!supplier.email) {
            results.push({
              material_group: group.material_group,
              supplier_id: supplierId,
              supplier_name: supplier.company_name,
              tracking_code: trackingCode,
              status: "failed",
              error: "Fournisseur sans adresse email",
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
            supplier_name: supplierCompanyName,
            tracking_code: trackingCode,
            status: "failed",
            error: "Fournisseur sans adresse email",
          });
          continue;
        }

        // Idempotence: this (supplier, lot) pair already has a request that
        // actually left the mailbox — do not email the supplier again.
        const idempotencyKey = isManual
          ? `${supplierEmail.toLowerCase()}|${group.material_group}`
          : `${supplierId}|${group.material_group}`;
        if (alreadySentKeys.has(idempotencyKey)) {
          results.push({
            material_group: group.material_group,
            supplier_id: supplierId,
            supplier_name: supplierCompanyName,
            tracking_code: "",
            status: "skipped",
            reason: "already_sent",
          });
          continue;
        }

        // Create price request record.
        // H2: status starts at "pending" with sent_at = null. It is promoted to
        // "sent" only once Microsoft Graph has accepted the message, so a delivery
        // failure can no longer masquerade as a sent request.
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
          sent_at: null,
          status: "pending",
        };

        if (isManual) {
          // Manual supplier — no FK, store name/email directly
          insertData.supplier_id = null;
          insertData.supplier_name_manual = supplierCompanyName;
          insertData.supplier_email_manual = supplierEmail;
        } else {
          insertData.supplier_id = supplierId;
        }

        // Supplier portal: one unguessable token per request (migration 099).
        // The token and the language are persisted whenever the columns exist —
        // independently of the app URL (the language must survive even when the
        // portal link cannot be built).
        const portalToken = generatePortalToken();
        if (portalColumnsAvailable) {
          insertData.portal_token = portalToken;
          insertData.language = language;
        }

        // Who sent the request → who gets the "offre reçue" notification (104).
        if (sentByColumnAvailable) {
          insertData.sent_by = user.id;
        }

        let { data: inserted, error: insertError } = await (admin as any)
          .from("submission_price_requests")
          .insert(insertData)
          .select("id")
          .single();

        // Migration 104 not applied → retry without sent_by.
        // (Checked FIRST: the generic "schema cache" pattern of the portal
        // fallback below would otherwise swallow this error too.)
        if (insertError && sentByColumnAvailable && /sent_by/i.test(insertError.message || "")) {
          console.warn("[SEND] sent_by column missing — apply migration 104.");
          sentByColumnAvailable = false;
          delete insertData.sent_by;
          const retry = await (admin as any)
            .from("submission_price_requests")
            .insert(insertData)
            .select("id")
            .single();
          inserted = retry.data;
          insertError = retry.error;
        }

        // Migration 099 not applied → retry without the portal columns.
        if (
          insertError &&
          /portal_token|column .*language|schema cache/i.test(insertError.message || "")
        ) {
          console.warn(
            "[SEND] portal columns missing — apply migration 099. Falling back to email-only reply."
          );
          portalColumnsAvailable = false;
          delete insertData.portal_token;
          delete insertData.language;
          const retry = await (admin as any)
            .from("submission_price_requests")
            .insert(insertData)
            .select("id")
            .single();
          inserted = retry.data;
          insertError = retry.error;
        }

        // Fallback for a database where migration 082 has not widened the status
        // CHECK constraint yet — insert with the legacy value but still no sent_at.
        if (insertError && /check constraint|violates/i.test(insertError.message || "")) {
          console.warn("[SEND] status='pending' rejected — apply migration 082. Falling back to legacy value.");
          const retry = await (admin as any)
            .from("submission_price_requests")
            .insert({ ...insertData, status: "sent" })
            .select("id")
            .single();
          inserted = retry.data;
          insertError = retry.error;
        }

        if (insertError || !inserted?.id) {
          console.error("[SEND] Insert failed:", insertError?.message);
          results.push({
            material_group: group.material_group,
            supplier_id: supplierId,
            supplier_name: supplierCompanyName,
            tracking_code: trackingCode,
            status: "failed",
            error: insertError?.message || "Enregistrement de la demande impossible",
          });
          continue;
        }

        const priceRequestId: string = inserted.id;

        // The portal link only exists if the token could actually be stored
        // AND an app URL is configured (the language is persisted regardless).
        const portalUrl =
          appUrl && portalColumnsAvailable ? buildPortalUrl(appUrl, portalToken, language) : null;

        // Generate and send email
        if (canSendEmail) {
          try {
            const projectName = (submission as any).projects?.name || "Projet";
            const s = supplierStrings(language);

            let subject: string;
            let htmlContent: string;

            // Per-(supplier, lot) overrides first (new shape), then the legacy
            // flat per-supplier shape, then the global fallbacks.
            const effectiveCustomBody =
              resolveOverride(body.custom_bodies?.[supplierId], group.material_group) ||
              body.custom_body;
            const effectiveCustomSubject =
              resolveOverride(body.custom_subjects?.[supplierId], group.material_group) ||
              body.custom_subject;

            if (effectiveCustomBody) {
              // Use custom content from editable preview
              subject = effectiveCustomSubject || s.prSubject(projectName, group.material_group);
              const itemsTableHtml = renderItemsTable(groupItems, language);
              htmlContent = customBodyToHtml(
                effectiveCustomBody,
                itemsTableHtml,
                trackingCode,
                language,
                portalUrl
              );
              // Append user signature if available
              if (userProfile.email_signature?.trim()) {
                htmlContent += `<br/><p>--<br/>${userProfile.email_signature.replace(/\n/g, "<br/>")}</p>`;
              }
              console.log("[SEND] Using custom email body for supplier:", supplierEmail);
            } else {
              const emailBody = buildPriceRequestEmail({
                contactName: supplierContactName,
                projectName,
                materialGroup: group.material_group,
                items: groupItems,
                trackingCode,
                portalUrl,
                deadline: body.deadline,
                senderName: `${userProfile.first_name} ${userProfile.last_name}`,
                senderCompany: org?.name || "",
                senderTitle: userProfile.job_title,
                language,
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

            // H2: only now is the request really "sent"
            const { error: sentUpdateError } = await (admin as any)
              .from("submission_price_requests")
              .update({ status: "sent", sent_at: new Date().toISOString() })
              .eq("id", priceRequestId);

            if (sentUpdateError) {
              console.error("[SEND] Email delivered but status update failed:", sentUpdateError.message);
            }

            // Same pair listed twice in this payload → the second pass skips.
            alreadySentKeys.add(idempotencyKey);

            results.push({
              material_group: group.material_group,
              supplier_id: supplierId,
              supplier_name: supplierCompanyName,
              tracking_code: trackingCode,
              status: "sent",
            });
          } catch (emailError: any) {
            console.error("[SEND] Email error for supplier:", supplierEmail, "error:", emailError.message, "stack:", emailError.stack);
            const message = `Échec d'envoi: ${emailError.message}`;
            await markFailed(priceRequestId, message);
            results.push({
              material_group: group.material_group,
              supplier_id: supplierId,
              supplier_name: supplierCompanyName,
              tracking_code: trackingCode,
              status: "failed",
              error: message,
            });
          }
        } else {
          console.warn("[SEND] Skipping email (no Microsoft token) for supplier:", supplierEmail);
          const message = microsoftError || "Microsoft non connecté — demande enregistrée mais non envoyée";
          await markFailed(priceRequestId, message);
          results.push({
            material_group: group.material_group,
            supplier_id: supplierId,
            supplier_name: supplierCompanyName,
            tracking_code: trackingCode,
            status: "failed",
            error: message,
          });
        }
      }
    }

    const sentCount = results.filter((r) => r.status === "sent").length;
    const failedCount = results.filter((r) => r.status === "failed").length;
    const skippedCount = results.filter((r) => r.status === "skipped").length;
    console.log("[SEND] Done. Sent:", sentCount, "Failed:", failedCount, "Skipped:", skippedCount);

    return NextResponse.json({
      success: true,
      sent: sentCount,
      failed: failedCount,
      skipped: skippedCount,
      // `saved` kept for backward compatibility with older clients: a failed
      // request is still persisted, it simply never left the mailbox.
      saved: failedCount,
      results,
      ...(microsoftError ? { microsoft_error: microsoftError } : {}),
      ...(portalDisabledReason ? { portal_disabled_reason: portalDisabledReason } : {}),
    });

  } catch (err: any) {
    console.error("[SEND] Fatal error:", err.message, "stack:", err.stack);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * Renders a supplier-authored (edited-in-preview) body into HTML, then appends
 * the portal call-to-action and the tracking-code note in the supplier language.
 *
 * The body itself is edited as PLAIN TEXT in the preview textarea, so it is
 * escaped before being turned into HTML (M8). Item descriptions and names come
 * from parsed documents: an unescaped `<` was enough to break the markup of a
 * mail sent from the user's own mailbox.
 */
function customBodyToHtml(
  text: string,
  itemsTableHtml: string,
  trackingCode: string,
  language: SupplierLanguage,
  portalUrl: string | null
): string {
  const s = supplierStrings(language);
  const TABLE_MARKER = "[TABLEAU AUTOMATIQUE]";
  const paragraphs = text.split("\n\n");

  // Detect the plain-text items table pasted back from the preview textarea,
  // in ANY of the three supplier languages (FR "N°/Description",
  // DE "Nr./Bezeichnung", EN "No./Description") — the old check only knew the
  // French headers, so an edited DE/EN body shipped the raw ASCII table.
  function isTextTable(block: string): boolean {
    const lines = block.trim().split("\n");
    if (lines.length < 3) return false;
    const header = lines[0];
    const separatorNext = lines[1].trim().startsWith("---");
    if (!separatorNext) return false;
    // Structural: a pipe-separated header row over a "---" separator line.
    if (header.split("|").length - 1 >= 2) return true;
    // Header words of one of the three supplier languages.
    return (["fr", "de", "en"] as const).some((lang) => {
      const t = supplierStrings(lang);
      return header.includes(t.colNumber) && header.includes(t.colDescription);
    });
  }

  const htmlParts = paragraphs
    .map((p) => {
      const trimmed = p.trim();
      if (!trimmed) return "";
      if (trimmed === TABLE_MARKER) return itemsTableHtml;
      if (isTextTable(trimmed)) return itemsTableHtml;
      // The custom body is edited as PLAIN TEXT in the preview textarea, so it is
      // escaped before being turned into HTML (M8).
      const content = escapeHtml(trimmed).replace(/\n/g, "<br/>");
      return `<p>${content}</p>`;
    })
    .filter(Boolean);

  // Portal CTA — the supplier answers online instead of writing an email back.
  if (portalUrl) {
    htmlParts.push(renderPortalBlock(portalUrl, language));
  }

  // Auto-append the tracking-code box, in the supplier's language.
  htmlParts.push(
    `<p style="background:#f0f9ff;padding:12px;border-radius:6px;border-left:4px solid #3b82f6;margin:16px 0;">${s.prTracking(trackingCode)}</p>`
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
