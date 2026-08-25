import { getValidMicrosoftToken } from "@/lib/microsoft/tokens";
import {
  buildPortalUrl,
  buildReminderEmail,
  normalizeSupplierLanguage,
  renderPortalBlock,
  supplierStrings,
  escapeHtml,
} from "@cantaia/core/submissions";
import { getAppUrl } from "@/lib/env";

/**
 * Supplier reminder ("relance") for one price request.
 *
 * Lives in lib/ (not in a route.ts): a route file may only export HTTP
 * handlers (next build rejects anything else), and this path is shared by
 * POST /api/submissions/[id]/relance (manual button) and the followups agent
 * (PATCH /api/agents/followups with action:"send").
 */

/** Minimum delay between two reminders to the same supplier. */
export const RELANCE_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export interface RelanceOutcome {
  ok: boolean;
  sent: boolean;
  relance_count?: number;
  /** Machine-readable reason when `ok` is false. */
  reason?:
    | "not_found"
    | "already_responded"
    | "no_email"
    | "forbidden"
    | "invalid_status"
    | "too_soon";
  /** Seconds until a new reminder is allowed (reason "too_soon" only). */
  retry_after_sec?: number;
  error?: string;
}

export interface RelanceOptions {
  admin: any;
  userId: string;
  organizationId: string;
  submissionId: string;
  requestId: string;
  customSubject?: string | null;
  customBody?: string | null;
}

/**
 * Core reminder path. Verifies org ownership itself, so every caller is
 * IDOR-safe by construction rather than by remembering to check.
 *
 * Guards enforced here (they protect the manual button AND the agent/cron,
 * which both go through this function):
 *   - only a request with status 'sent' can be reminded (a 'pending'/'failed'
 *     request never left the mailbox, a 'responded' one no longer needs it);
 *   - at most one reminder per 24 h per request (reason "too_soon");
 *   - relance_count / last_relance_at move ONLY when Graph accepted the mail.
 */
export async function sendRelanceForRequest(opts: RelanceOptions): Promise<RelanceOutcome> {
  const { admin, userId, organizationId, submissionId, requestId } = opts;

  const { data: priceRequest } = await admin
    .from("submission_price_requests")
    .select("*, suppliers(id, company_name, contact_name, email)")
    .eq("id", requestId)
    .eq("submission_id", submissionId)
    .maybeSingle();

  if (!priceRequest) return { ok: false, sent: false, reason: "not_found" };
  if (priceRequest.status === "responded") {
    return { ok: false, sent: false, reason: "already_responded" };
  }
  if (priceRequest.status !== "sent") {
    // pending / failed / expired: the original request never reached the
    // supplier (or is closed) — a reminder would make no sense.
    return { ok: false, sent: false, reason: "invalid_status" };
  }

  // Anti double-relance: 24 h cooldown shared by the button and the cron.
  if (priceRequest.last_relance_at) {
    const elapsed = Date.now() - new Date(priceRequest.last_relance_at).getTime();
    if (Number.isFinite(elapsed) && elapsed >= 0 && elapsed < RELANCE_COOLDOWN_MS) {
      return {
        ok: false,
        sent: false,
        reason: "too_soon",
        retry_after_sec: Math.ceil((RELANCE_COOLDOWN_MS - elapsed) / 1000),
      };
    }
  }

  const supplierEmail: string | null =
    priceRequest.suppliers?.email || priceRequest.supplier_email_manual || null;
  if (!supplierEmail) return { ok: false, sent: false, reason: "no_email" };

  const { data: submission } = await admin
    .from("submissions")
    .select("id, project_id, deadline, projects!submissions_project_id_fkey(id, name, organization_id)")
    .eq("id", submissionId)
    .maybeSingle();

  // Anti-IDOR: unconditional. A submission without a project is refused rather
  // than let through, because there is then nothing to check ownership against.
  const projectOrg = (submission as any)?.projects?.organization_id;
  if (!submission?.project_id || !projectOrg || projectOrg !== organizationId) {
    return { ok: false, sent: false, reason: "forbidden" };
  }

  const projectName = (submission as any)?.projects?.name || "Projet";

  const { data: userProfile } = await admin
    .from("users")
    .select("first_name, last_name, email, job_title, email_signature")
    .eq("id", userId)
    .maybeSingle();

  const { data: org } = await admin
    .from("organizations")
    .select("name")
    .eq("id", organizationId)
    .maybeSingle();

  const language = normalizeSupplierLanguage(priceRequest.language);
  const s = supplierStrings(language);
  const relanceNum = (priceRequest.relance_count || 0) + 1;
  const deadline = priceRequest.deadline || (submission as any)?.deadline || null;

  const appUrl = getAppUrl();
  const portalUrl =
    appUrl && priceRequest.portal_token
      ? buildPortalUrl(appUrl, priceRequest.portal_token, language)
      : null;

  const senderName = `${userProfile?.first_name || ""} ${userProfile?.last_name || ""}`.trim();

  let subject: string;
  let html: string;

  if (opts.customBody) {
    subject =
      opts.customSubject || s.reSubject(relanceNum, projectName, priceRequest.material_group || "");
    // Edited as plain text in the relance modal → escaped before becoming HTML.
    const bodyHtml = opts.customBody
      .split("\n\n")
      .map((p) => {
        const trimmed = p.trim();
        if (!trimmed) return "";
        return `<p>${escapeHtml(trimmed).replace(/\n/g, "<br/>")}</p>`;
      })
      .filter(Boolean)
      .join("\n\n");

    html = [
      bodyHtml,
      portalUrl ? renderPortalBlock(portalUrl, language) : "",
      `<p style="background:#fef3c7;padding:12px;border-radius:6px;border-left:4px solid #f59e0b;margin:16px 0;">${s.reReference(priceRequest.tracking_code || "")}</p>`,
    ]
      .filter(Boolean)
      .join("\n\n");
  } else {
    const built = buildReminderEmail({
      contactName: priceRequest.suppliers?.contact_name || null,
      projectName,
      materialGroup: priceRequest.material_group || "",
      trackingCode: priceRequest.tracking_code || "",
      relanceNumber: relanceNum,
      deadline,
      portalUrl,
      language,
      senderName,
      senderTitle: userProfile?.job_title || null,
      senderCompany: org?.name || "",
      emailSignature: userProfile?.email_signature || null,
    });
    subject = opts.customSubject || built.subject;
    html = built.html;
  }

  /** Counted ONLY once Graph accepted the message — a failed send must stay retriable. */
  const bumpCount = async () => {
    const { error } = await admin
      .from("submission_price_requests")
      .update({ relance_count: relanceNum, last_relance_at: new Date().toISOString() })
      .eq("id", requestId);
    if (error) console.error("[relance] relance_count update failed:", error.message);
  };

  const tokenResult = await getValidMicrosoftToken(userId);
  if ("error" in tokenResult) {
    return {
      ok: true,
      sent: false,
      error: "Microsoft non connecté — relance non envoyée",
    };
  }

  try {
    const response = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenResult.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          subject,
          body: { contentType: "HTML", content: html },
          toRecipients: [{ emailAddress: { address: supplierEmail } }],
          from: { emailAddress: { address: userProfile?.email } },
        },
        saveToSentItems: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Graph API error ${response.status}: ${errorText}`);
    }
  } catch (emailError: any) {
    console.error("[relance] Email error:", emailError);
    return { ok: true, sent: false, error: emailError.message };
  }

  await bumpCount();
  return { ok: true, sent: true, relance_count: relanceNum };
}
