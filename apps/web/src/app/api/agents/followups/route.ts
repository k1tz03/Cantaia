import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEmailProvider, type EmailConnectionConfig } from "@cantaia/core/emails";
import { getValidMicrosoftToken } from "@/lib/microsoft/tokens";
import { sendRelanceForRequest } from "@/lib/submissions/relance";

/**
 * GET /api/agents/followups
 * Lists followup items for the current user's organization.
 * Query params:
 *   - status: 'pending' | 'approved' | 'sent' | 'dismissed' | 'snoozed' (default: 'pending')
 *   - urgency: 'low' | 'medium' | 'high' | 'critical' (optional filter)
 *   - type: followup_type filter (optional)
 *   - project_id: UUID (optional filter)
 *   - limit: number (default: 50, max: 100)
 *
 * PATCH /api/agents/followups
 *   { followup_id, status, snoozed_until? }   → update the status
 *   { followup_id, action: "send" }           → ACTUALLY SEND, then mark 'sent'
 *
 * The "send" branch is what turns the Followup Engine from a to-do list into a
 * closed loop: "Valider" previously flipped a status and sent nothing, so a
 * price request flagged as overdue stayed overdue.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  const { data: profile } = await (admin as any)
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.organization_id) {
    return NextResponse.json({ error: "No organization" }, { status: 403 });
  }

  // Wake up expired snoozes before listing: a "reporter 3 jours" item must
  // come back as pending on day 4 instead of sleeping forever.
  const { error: wakeError } = await (admin as any)
    .from("followup_items")
    .update({ status: "pending", snoozed_until: null })
    .eq("organization_id", profile.organization_id)
    .eq("status", "snoozed")
    .lte("snoozed_until", new Date().toISOString());
  if (wakeError) {
    console.warn("[api/agents/followups] snooze wake-up failed:", wakeError.message);
  }

  const url = request.nextUrl;
  const status = url.searchParams.get("status") || "pending";
  const urgency = url.searchParams.get("urgency");
  const type = url.searchParams.get("type");
  const projectId = url.searchParams.get("project_id");
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 100);

  let query = (admin as any)
    .from("followup_items")
    .select(`
      id,
      followup_type,
      source_type,
      source_id,
      project_id,
      supplier_id,
      title,
      description,
      urgency,
      suggested_action,
      draft_email_subject,
      draft_email_body,
      recipient_email,
      recipient_name,
      days_overdue,
      status,
      snoozed_until,
      agent_session_id,
      created_at,
      updated_at
    `)
    .eq("organization_id", profile.organization_id)
    .eq("status", status)
    .order("urgency", { ascending: true }) // critical first
    .order("created_at", { ascending: false })
    .limit(limit);

  if (urgency) query = query.eq("urgency", urgency);
  if (type) query = query.eq("followup_type", type);
  if (projectId) query = query.eq("project_id", projectId);

  const { data: followups, error } = await query;

  if (error) {
    console.error("[api/agents/followups] Error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ followups: followups || [], count: followups?.length || 0 });
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { followup_id, status, snoozed_until, action } = body;

  const isSend = action === "send";

  if (!followup_id || (!status && !isSend)) {
    return NextResponse.json({ error: "followup_id and status required" }, { status: 400 });
  }

  const validStatuses = ["pending", "approved", "sent", "dismissed", "snoozed"];
  if (!isSend && !validStatuses.includes(status)) {
    return NextResponse.json({ error: `Invalid status` }, { status: 400 });
  }

  const admin = createAdminClient();

  // Verify org ownership
  const { data: item } = await (admin as any)
    .from("followup_items")
    .select(
      "id, organization_id, followup_type, source_type, source_id, supplier_id, " +
      "draft_email_subject, draft_email_body, recipient_email, recipient_name, status"
    )
    .eq("id", followup_id)
    .maybeSingle();

  if (!item) {
    return NextResponse.json({ error: "Followup not found" }, { status: 404 });
  }

  const { data: profile } = await (admin as any)
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();

  if (item.organization_id !== profile?.organization_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // ── action: "send" — actually deliver, then record the outcome ──
  if (isSend) {
    if (item.status === "sent") {
      return NextResponse.json({ error: "Followup already sent" }, { status: 409 });
    }

    const outcome = await deliverFollowup({
      admin,
      userId: user.id,
      organizationId: profile.organization_id,
      item,
    });

    if (!outcome.sent) {
      // The item stays actionable — a failed send must not look like a success.
      const { error: failError } = await (admin as any)
        .from("followup_items")
        .update({ send_error: outcome.error?.slice(0, 500) ?? "send failed" })
        .eq("id", followup_id);
      if (failError) {
        console.warn(
          "[api/agents/followups] send_error not persisted (apply migration 099):",
          failError.message
        );
      }
      return NextResponse.json(
        { error: outcome.error || "Envoi impossible", followup_id },
        { status: 502 }
      );
    }

    const sentAt = new Date().toISOString();
    // Core state first, bookkeeping after: a database without migration 099
    // must still record that the followup was sent.
    const { error: statusError } = await (admin as any)
      .from("followup_items")
      .update({ status: "sent" })
      .eq("id", followup_id);

    if (statusError) {
      console.error("[api/agents/followups] status update failed:", statusError.message);
      return NextResponse.json({ error: statusError.message }, { status: 500 });
    }

    const { error: stampError } = await (admin as any)
      .from("followup_items")
      .update({ sent_at: sentAt, send_error: null })
      .eq("id", followup_id);
    if (stampError) {
      console.warn(
        "[api/agents/followups] sent_at not persisted (apply migration 099):",
        stampError.message
      );
    }

    return NextResponse.json({
      success: true,
      followup_id,
      status: "sent",
      sent_at: sentAt,
      channel: outcome.channel,
    });
  }

  const updateData: Record<string, unknown> = { status };
  if (status === "snoozed" && snoozed_until) {
    updateData.snoozed_until = snoozed_until;
  }

  const { error } = await (admin as any)
    .from("followup_items")
    .update(updateData)
    .eq("id", followup_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, followup_id, status });
}

/* ═══════════════════════════════════════════════════════════════
   Delivery
   ═══════════════════════════════════════════════════════════════ */

interface DeliverResult {
  sent: boolean;
  channel?: "relance" | "draft";
  error?: string;
}

/**
 * Two delivery paths:
 *
 *   price_request_no_response → the real relance path, so the supplier gets
 *     the localized reminder WITH the portal link and `relance_count` moves.
 *     `source_id` is the PRICE REQUEST id (scan_overdue_items) — resolved
 *     directly, so the reminder can never target the wrong supplier. Legacy
 *     items whose source_id is a submission id fall back to the old
 *     submission + supplier scan.
 *
 *   everything else → send the agent's draft through the user's own mailbox,
 *     the same provider path /api/email/send uses.
 */
async function deliverFollowup(opts: {
  admin: any;
  userId: string;
  organizationId: string;
  item: any;
}): Promise<DeliverResult> {
  const { admin, userId, organizationId, item } = opts;

  if (item.followup_type === "price_request_no_response") {
    if (!item.source_id) {
      return { sent: false, error: "Demande de prix introuvable (source manquante)" };
    }

    // New shape: source_id IS the price request.
    const { data: directRequest, error: directError } = await admin
      .from("submission_price_requests")
      .select("id, submission_id")
      .eq("id", item.source_id)
      .maybeSingle();

    if (directError) {
      console.error("[followups/send] price request lookup failed:", directError.message);
      return { sent: false, error: "Demande de prix introuvable" };
    }

    let requestId: string | null = directRequest?.id ?? null;
    let submissionId: string | null = directRequest?.submission_id ?? null;

    if (!requestId) {
      // Legacy item: source_id was the submission id — resolve the still-open
      // request for this submission + supplier as before.
      let query = admin
        .from("submission_price_requests")
        .select("id, submission_id")
        .eq("submission_id", item.source_id)
        .eq("status", "sent")
        .order("sent_at", { ascending: false })
        .limit(1);

      if (item.supplier_id) query = query.eq("supplier_id", item.supplier_id);

      const { data: priceRequest, error: prError } = await query.maybeSingle();

      if (prError) {
        console.error("[followups/send] price request lookup failed:", prError.message);
        return { sent: false, error: "Demande de prix introuvable" };
      }
      if (!priceRequest?.id) {
        return { sent: false, error: "Aucune demande de prix en attente pour ce fournisseur" };
      }
      requestId = priceRequest.id;
      submissionId = priceRequest.submission_id;
    }

    if (!requestId || !submissionId) {
      return { sent: false, error: "Demande de prix introuvable" };
    }

    const outcome = await sendRelanceForRequest({
      admin,
      userId,
      organizationId,
      submissionId,
      requestId,
    });

    if (!outcome.ok) {
      const message =
        outcome.reason === "no_email"
          ? "Le fournisseur n'a pas d'adresse email"
          : outcome.reason === "already_responded"
            ? "Le fournisseur a déjà répondu"
            : outcome.reason === "too_soon"
              ? "Une relance a déjà été envoyée il y a moins de 24 h"
              : outcome.reason === "invalid_status"
                ? "Cette demande ne peut pas être relancée (jamais envoyée ou clôturée)"
                : "Relance impossible";
      return { sent: false, error: message };
    }
    if (!outcome.sent) {
      return { sent: false, error: outcome.error || "Relance non envoyée" };
    }
    return { sent: true, channel: "relance" };
  }

  // ── Generic draft path ────────────────────────────────────
  if (!item.recipient_email) {
    return { sent: false, error: "Aucun destinataire pour cette relance" };
  }
  if (!item.draft_email_subject || !item.draft_email_body) {
    return { sent: false, error: "Aucun brouillon d'email à envoyer" };
  }

  const { data: connection } = await admin
    .from("email_connections")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!connection) {
    return { sent: false, error: "Aucune connexion email active" };
  }

  if (connection.provider === "microsoft") {
    const tokenResult = await getValidMicrosoftToken(userId);
    if ("error" in tokenResult) return { sent: false, error: tokenResult.error };
    connection.oauth_access_token = tokenResult.accessToken;
  }

  // The draft is authored by the agent as plain text — turn it into HTML rather
  // than shipping raw newlines that collapse in a mail client.
  const bodyHtml = String(item.draft_email_body)
    .split(/\n{2,}/)
    .map((p: string) => p.trim())
    .filter(Boolean)
    .map((p: string) => `<p>${escapeForEmail(p).replace(/\n/g, "<br/>")}</p>`)
    .join("\n");

  try {
    const provider = getEmailProvider(connection.provider);
    await provider.sendEmail(connection as EmailConnectionConfig, {
      to: [item.recipient_email],
      subject: item.draft_email_subject,
      bodyHtml,
    });
    return { sent: true, channel: "draft" };
  } catch (err) {
    console.error("[followups/send] provider send failed:", err);
    return {
      sent: false,
      error: err instanceof Error ? err.message : "Envoi impossible",
    };
  }
}

function escapeForEmail(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
