// ============================================================
// Notification email template (HTML, light background)
// ============================================================
//
// The app UI is a hardcoded dark theme, but an email is NOT: Outlook / Gmail
// render on a light canvas and strip most CSS. So this template is deliberately
// table-based, light-background, with explicit colours on every text node —
// the same discipline as packages/core/src/emails/invite-email.ts.

import type { NotificationLocale } from "./types";

export interface RenderNotificationEmailOptions {
  title: string;
  body: string;
  ctaLabel?: string;
  ctaUrl?: string;
  locale: NotificationLocale;
  /** Optional small print under the CTA (e.g. deadline, project name). */
  footnote?: string;
}

const TAGLINES: Record<NotificationLocale, string> = {
  fr: "L'IA au service du chantier",
  en: "AI-powered construction management",
  de: "KI-gestützte Baustellenverwaltung",
};

const PREFERENCES_LABELS: Record<NotificationLocale, string> = {
  fr: "Gérer mes notifications",
  en: "Manage my notifications",
  de: "Benachrichtigungen verwalten",
};

const BASE_URL = "https://cantaia.io";

/** Minimal HTML escaping — every interpolated value is user/DB content. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Converts the plain-text `body` into escaped HTML paragraphs.
 * Newlines are meaningful (the callers write short multi-line bodies).
 */
function renderBody(body: string): string {
  return body
    .split(/\n{2,}/)
    .map(
      (para) =>
        `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#3F3F46">${escapeHtml(
          para
        ).replace(/\n/g, "<br>")}</p>`
    )
    .join("");
}

/**
 * Renders a Cantaia notification email.
 * Pure function — no I/O, safe to unit-test and to call from a cron.
 */
export function renderNotificationEmail(opts: RenderNotificationEmailOptions): string {
  const locale = opts.locale || "fr";
  const tagline = TAGLINES[locale] || TAGLINES.fr;
  const prefsLabel = PREFERENCES_LABELS[locale] || PREFERENCES_LABELS.fr;
  const prefsUrl = `${BASE_URL}/${locale}/settings?tab=notifications`;

  const cta =
    opts.ctaLabel && opts.ctaUrl
      ? `<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px"><tr><td align="center">
<a href="${escapeHtml(opts.ctaUrl)}" style="display:inline-block;background:linear-gradient(135deg,#F97316,#EA580C);color:#FFFFFF;font-size:15px;font-weight:700;padding:13px 34px;border-radius:8px;text-decoration:none">${escapeHtml(
          opts.ctaLabel
        )}</a>
</td></tr></table>`
      : "";

  const footnote = opts.footnote
    ? `<p style="margin:18px 0 0;font-size:13px;color:#71717A">${escapeHtml(opts.footnote)}</p>`
    : "";

  return `<!DOCTYPE html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(
    opts.title
  )}</title></head>
<body style="margin:0;padding:0;background:#F4F4F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F4F4F5;padding:40px 20px">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1)">
<tr><td style="background:#0F0F11;padding:22px 32px;text-align:center">
<table cellpadding="0" cellspacing="0" style="display:inline-table"><tr>
<td style="background:linear-gradient(135deg,#F97316,#EA580C);width:32px;height:32px;border-radius:8px;text-align:center;vertical-align:middle;color:#ffffff;font-weight:800;font-size:16px;line-height:32px">C</td>
<td style="padding-left:10px;color:#FAFAFA;font-size:18px;font-weight:700;letter-spacing:-0.5px">Cantaia</td>
</tr></table>
</td></tr>
<tr><td style="padding:30px 32px 26px">
<h1 style="margin:0 0 14px;font-size:20px;font-weight:700;color:#18181B;line-height:1.35">${escapeHtml(
    opts.title
  )}</h1>
${renderBody(opts.body)}
${cta}
${footnote}
</td></tr>
<tr><td style="padding:0 32px 26px;text-align:center;border-top:1px solid #E4E4E7">
<p style="margin:16px 0 0;font-size:12px;color:#A1A1AA">Cantaia — ${escapeHtml(tagline)}</p>
<p style="margin:6px 0 0;font-size:11px;color:#A1A1AA"><a href="${prefsUrl}" style="color:#71717A;text-decoration:underline">${escapeHtml(
    prefsLabel
  )}</a></p>
</td></tr>
</table>
</td></tr></table></body></html>`;
}

/** Plain-text fallback part, for clients that refuse HTML. */
export function renderNotificationText(opts: RenderNotificationEmailOptions): string {
  const parts = [opts.title, "", opts.body];
  if (opts.ctaLabel && opts.ctaUrl) parts.push("", `${opts.ctaLabel}: ${opts.ctaUrl}`);
  if (opts.footnote) parts.push("", opts.footnote);
  parts.push("", "— Cantaia");
  return parts.join("\n");
}
