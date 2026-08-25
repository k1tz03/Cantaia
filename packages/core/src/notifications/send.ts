// ============================================================
// Resend transport — no-throw by construction
// ============================================================
//
// A notification must NEVER be able to fail the business action that triggered
// it: assigning a task, replying to a ticket, running the reminder cron. Every
// path here returns `false` instead of throwing, and logs a single line.
//
// Uses the REST API directly (fetch) rather than the `resend` SDK so the module
// stays dependency-free and usable from any runtime.

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const DEFAULT_FROM = "Cantaia <notifications@cantaia.io>";
/** Resend refuses a request that hangs; keep the cron predictable. */
const SEND_TIMEOUT_MS = 10_000;

export interface SendNotificationEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  /** Overrides `NOTIFICATIONS_FROM_EMAIL` / the default sender. */
  from?: string;
  replyTo?: string;
}

/**
 * Sends one notification email through Resend.
 * Returns `false` (never throws) when `RESEND_API_KEY` is missing, the address
 * is empty, or the API answers with an error.
 */
export async function sendNotificationEmail(
  opts: SendNotificationEmailOptions
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[notifications] RESEND_API_KEY missing — email not sent:", opts.subject);
    return false;
  }

  const to = (opts.to || "").trim();
  if (!to || !to.includes("@")) {
    console.warn("[notifications] invalid recipient — email not sent:", opts.subject);
    return false;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);

  try {
    const payload: Record<string, unknown> = {
      from: opts.from || process.env.NOTIFICATIONS_FROM_EMAIL || DEFAULT_FROM,
      to: [to],
      subject: opts.subject,
      html: opts.html,
    };
    if (opts.text) payload.text = opts.text;
    if (opts.replyTo) payload.reply_to = opts.replyTo;

    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(
        `[notifications] Resend ${res.status} for "${opts.subject}": ${detail.slice(0, 300)}`
      );
      return false;
    }

    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[notifications] send failed for "${opts.subject}": ${message}`);
    return false;
  } finally {
    clearTimeout(timer);
  }
}
