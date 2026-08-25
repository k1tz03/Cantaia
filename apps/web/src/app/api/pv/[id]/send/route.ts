// ============================================================
// POST /api/pv/[id]/send — circulate a finalized PV (Agent O)
// ============================================================
// A PV that stays in the app is a Word document with extra steps. This route
// closes the loop: render the PDF, mail it to the participants with the
// opposition deadline spelled out, and record who received it and when.
//
// Transport, in order:
//   1. the user's own mailbox (Microsoft / Gmail / IMAP) — the PV then lands in
//      their Sent folder and replies come back to them, which is what a
//      conducteur de travaux actually needs;
//   2. Resend, when no mailbox is connected — same PDF, from the Cantaia
//      notification sender, with the user's address as reply-to.
//
// The HTML body is rendered by `renderNotificationEmail` (@cantaia/core/
// notifications, Agent A), imported statically — the module IS in the package
// `exports` map (`./notifications`), so no runtime-import hack is needed.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseBody } from "@/lib/api/parse-body";
import { getEmailProvider, type EmailConnectionConfig } from "@cantaia/core/emails";
import { renderNotificationEmail } from "@cantaia/core/notifications";
import { getValidMicrosoftToken } from "@/lib/microsoft/tokens";
import { logActivityAsync } from "@cantaia/core/tracking";
import { buildPVPdf } from "../../_shared/pv-pdf";

/** Rendering a PDF then talking to Graph/Resend can outlive the 10s default. */
export const maxDuration = 120;

/**
 * Hard cap on the raw PDF size. Kept well under the point where base64
 * inflation (+33%) pushes a Graph `sendMail` JSON request past its ~4 MB total
 * limit — a bigger PDF falls back to Resend (`MAX_PROVIDER_ATTACHMENT_BYTES`).
 */
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
/**
 * A PDF larger than this cannot ride inside a Graph/Gmail `sendMail` JSON body
 * (base64 of ~3 MB ≈ 4 MB, Graph's ceiling). Above it, skip the user's mailbox
 * and go straight to Resend rather than fail the provider send opaquely.
 */
const MAX_PROVIDER_ATTACHMENT_BYTES = 3 * 1024 * 1024;
/** A PV goes to a séance, not to a mailing list. */
const MAX_RECIPIENTS = 50;
const RESEND_ENDPOINT = "https://api.resend.com/emails";
const RESEND_TIMEOUT_MS = 15_000;

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Deduplicated, validated, capped recipient list (case-insensitive). */
function normalizeRecipients(raw: unknown): { valid: string[]; invalid: string[] } {
  const input = Array.isArray(raw) ? raw : [];
  const seen = new Set<string>();
  const valid: string[] = [];
  const invalid: string[] = [];

  for (const entry of input) {
    const address = String(entry || "").trim();
    if (!address) continue;
    if (!EMAIL_RE.test(address)) {
      invalid.push(address);
      continue;
    }
    const key = address.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    valid.push(address);
    if (valid.length >= MAX_RECIPIENTS) break;
  }

  return { valid, invalid };
}

interface BodyOptions {
  title: string;
  body: string;
  footnote?: string;
  locale: "fr" | "en" | "de";
}

/** Renders the mail body with Agent A's shared notification template. */
function renderBody(opts: BodyOptions): string {
  return renderNotificationEmail(opts);
}

/** Plain-text part, for clients that refuse HTML. */
function renderText(opts: BodyOptions): string {
  const parts = [opts.title, "", opts.body];
  if (opts.footnote) parts.push("", opts.footnote);
  return parts.join("\n");
}

interface ResendAttachment {
  filename: string;
  content: string; // base64
}

/**
 * Resend transport WITH an attachment. `sendNotificationEmail` from
 * @cantaia/core/notifications cannot carry one, and the PDF is the whole point
 * of this route — so the REST call is made here, using the same env contract
 * (`RESEND_API_KEY`, `NOTIFICATIONS_FROM_EMAIL`) as the shared sender.
 */
async function sendViaResend(opts: {
  to: string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  attachments: ResendAttachment[];
}): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "RESEND_API_KEY absent" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RESEND_TIMEOUT_MS);

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.NOTIFICATIONS_FROM_EMAIL || "Cantaia <notifications@cantaia.io>",
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
        text: opts.text,
        ...(opts.replyTo ? { reply_to: opts.replyTo } : {}),
        attachments: opts.attachments,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { ok: false, error: `Resend ${res.status}: ${detail.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

// ------------------------------------------------------------
// Route
// ------------------------------------------------------------

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: body, error: parseError } = await parseBody(request);
    if (parseError || !body) {
      return NextResponse.json({ error: parseError || "Invalid request" }, { status: 400 });
    }

    const admin = createAdminClient();

    const { data: userProfile } = await (admin as any)
      .from("users")
      .select("organization_id, email, first_name, last_name, preferred_language")
      .eq("id", user.id)
      .maybeSingle();

    if (!userProfile?.organization_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // ---- Load + authorise the meeting -------------------------------------
    const { data: meeting } = await (admin as any)
      .from("meetings")
      .select("*, projects(id, name, code, organization_id)")
      .eq("id", id)
      .maybeSingle();

    if (!meeting) {
      return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    }

    const project = meeting.projects;
    if (!project || project.organization_id !== userProfile.organization_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!meeting.pv_content) {
      return NextResponse.json(
        { error: "Ce PV n'a pas encore de contenu — générez-le avant de l'envoyer." },
        { status: 400 }
      );
    }

    // A draft PV must not circulate: it is still being edited, and the
    // opposition deadline it announces would start from an unstable version.
    if (meeting.status !== "finalized" && meeting.status !== "sent") {
      return NextResponse.json(
        { error: "Le PV doit être finalisé avant d'être envoyé." },
        { status: 409 }
      );
    }

    // ---- Recipients --------------------------------------------------------
    const { valid: recipients, invalid } = normalizeRecipients(body.recipients);
    if (recipients.length === 0) {
      return NextResponse.json(
        {
          error:
            invalid.length > 0
              ? `Adresse(s) invalide(s) : ${invalid.slice(0, 3).join(", ")}`
              : "Aucun destinataire — ajoutez au moins une adresse e-mail.",
        },
        { status: 400 }
      );
    }

    // ---- PDF ---------------------------------------------------------------
    const pdf = await buildPVPdf(admin, meeting, userProfile.organization_id);

    if (pdf.buffer.length > MAX_ATTACHMENT_BYTES) {
      return NextResponse.json(
        { error: "Le PDF du PV dépasse la taille maximale autorisée en pièce jointe." },
        { status: 413 }
      );
    }

    // ---- Message -----------------------------------------------------------
    const locale = (["fr", "en", "de"] as const).includes(userProfile.preferred_language)
      ? (userProfile.preferred_language as "fr" | "en" | "de")
      : "fr";

    const seanceLabel = pdf.meetingNumber != null ? ` n°${pdf.meetingNumber}` : "";
    const subject =
      String(body.subject || "").trim() ||
      `PV de séance${seanceLabel} — ${pdf.projectName}${
        pdf.projectCode ? ` (${pdf.projectCode})` : ""
      }`;

    const senderName =
      [userProfile.first_name, userProfile.last_name].filter(Boolean).join(" ").trim() ||
      pdf.orgName;

    const customMessage = String(body.message || "").trim();
    const days = pdf.oppositionDeadlineDays;
    const oppositionLine =
      days > 0
        ? `Sauf opposition écrite dans un délai de ${days} jour${days > 1 ? "s" : ""} ` +
          `à compter de l'envoi du présent message, ce procès-verbal est réputé approuvé.`
        : "";

    const bodyText = [
      customMessage ||
        `Vous trouverez en pièce jointe le procès-verbal de la séance${seanceLabel} ` +
          `du chantier ${pdf.projectName}.`,
      oppositionLine,
      `${senderName}\n${pdf.orgName}`,
    ]
      .filter(Boolean)
      .join("\n\n");

    const bodyOptions: BodyOptions = {
      title: subject,
      body: bodyText,
      footnote: `Pièce jointe : ${pdf.filename}`,
      locale,
    };

    const html = renderBody(bodyOptions);
    const text = renderText(bodyOptions);
    // Above Graph/Gmail's ~4 MB JSON ceiling the mailbox send would fail
    // opaquely — route straight to Resend, which streams the attachment.
    const attachmentFitsProvider = pdf.buffer.length <= MAX_PROVIDER_ATTACHMENT_BYTES;

    // ---- Transport ---------------------------------------------------------
    let transport: "provider" | "resend" | null = null;
    const failures: string[] = [];

    const { data: connection } = await (admin as any)
      .from("email_connections")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (connection && attachmentFitsProvider) {
      try {
        if (connection.provider === "microsoft") {
          const tokenResult = await getValidMicrosoftToken(user.id);
          if ("error" in tokenResult) throw new Error(tokenResult.error);
          connection.oauth_access_token = tokenResult.accessToken;
        }

        const provider = getEmailProvider(connection.provider);
        await provider.sendEmail(connection as EmailConnectionConfig, {
          to: recipients,
          subject,
          bodyHtml: html,
          attachments: [
            {
              filename: pdf.filename,
              content: pdf.buffer,
              contentType: "application/pdf",
            },
          ],
        });
        transport = "provider";
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[PV Send] provider send failed, falling back to Resend:", message);
        failures.push(`boîte mail: ${message}`);
      }
    }

    if (!transport) {
      const resendResult = await sendViaResend({
        to: recipients,
        subject,
        html,
        text,
        replyTo: userProfile.email || undefined,
        attachments: [{ filename: pdf.filename, content: pdf.buffer.toString("base64") }],
      });
      if (resendResult.ok) {
        transport = "resend";
      } else {
        failures.push(`Resend: ${resendResult.error}`);
      }
    }

    if (!transport) {
      console.error("[PV Send] all transports failed:", failures.join(" | "));
      return NextResponse.json(
        {
          error:
            "Envoi impossible : aucune boîte mail connectée et l'envoi de secours a échoué. " +
            "Connectez votre messagerie dans Réglages > Intégrations, ou exportez le PDF et envoyez-le manuellement.",
          details: failures,
        },
        { status: 502 }
      );
    }

    // ---- Record the circulation -------------------------------------------
    const sentAt = new Date().toISOString();
    const { error: updateError } = await (admin as any)
      .from("meetings")
      .update({
        sent_to: recipients,
        sent_at: sentAt,
        status: "sent",
        updated_at: sentAt,
      })
      .eq("id", id);

    if (updateError) {
      // The mail is out; refusing here would make the user send it twice.
      console.error("[PV Send] mail sent but meeting update failed:", updateError.message);
    }

    logActivityAsync({
      supabase: admin as any,
      userId: user.id,
      organizationId: userProfile.organization_id,
      action: "send_pv",
      metadata: {
        meeting_id: id,
        project_id: project.id,
        meeting_number: pdf.meetingNumber,
        recipients_count: recipients.length,
        transport,
        opposition_deadline_days: days,
      },
    });

    return NextResponse.json({
      success: true,
      transport,
      sent_to: recipients,
      sent_at: sentAt,
      skipped_invalid: invalid,
      // Surfaced so the UI can warn "sent via Cantaia, not from your mailbox".
      warnings: failures,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[PV Send] Error:", message);
    return NextResponse.json(
      { error: `Échec de l'envoi du PV : ${message}` },
      { status: 500 }
    );
  }
}
