// Invitation email template and sender via Resend

interface InviteEmailParams {
  resendApiKey: string;
  inviteeEmail: string;
  inviterName: string;
  organizationName: string;
  subdomain?: string;
  role: string;
  message?: string;
  token: string;
  locale?: string;
}

const SUBJECTS: Record<string, (inviter: string, org: string) => string> = {
  fr: (inviter, org) => `${inviter} vous invite à rejoindre ${org} sur Cantaia`,
  en: (inviter, org) => `${inviter} invites you to join ${org} on Cantaia`,
  de: (inviter, org) => `${inviter} lädt Sie ein, ${org} auf Cantaia beizutreten`,
};

const ROLE_LABELS: Record<string, Record<string, string>> = {
  fr: { admin: "Administrateur", project_manager: "Chef de projet", member: "Membre", director: "Directeur", site_manager: "Conducteur de travaux", foreman: "Chef d'équipe" },
  en: { admin: "Administrator", project_manager: "Project Manager", member: "Member", director: "Director", site_manager: "Site Manager", foreman: "Foreman" },
  de: { admin: "Administrator", project_manager: "Projektleiter", member: "Mitglied", director: "Direktor", site_manager: "Bauleiter", foreman: "Polier" },
};

const CTA_LABELS: Record<string, string> = { fr: "Rejoindre", en: "Join", de: "Beitreten" };
const EXPIRES_LABELS: Record<string, string> = { fr: "Cette invitation expire dans 7 jours.", en: "This invitation expires in 7 days.", de: "Diese Einladung läuft in 7 Tagen ab." };

export function buildInviteEmailHtml(params: InviteEmailParams): string {
  const locale = params.locale || "fr";
  const roleLabel = ROLE_LABELS[locale]?.[params.role] || params.role;
  const ctaLabel = CTA_LABELS[locale] || "Rejoindre";
  const expiresLabel = EXPIRES_LABELS[locale] || EXPIRES_LABELS.fr;
  const baseDomain = "cantaia.io";
  const baseUrl = params.subdomain ? `https://${params.subdomain}.${baseDomain}` : `https://${baseDomain}`;
  const inviteUrl = `${baseUrl}/${locale}/register?invite_token=${params.token}`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F4F4F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F4F4F5;padding:40px 20px">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1)">
<tr><td style="background:#0F0F11;padding:24px 32px;text-align:center">
<table cellpadding="0" cellspacing="0" style="display:inline-table"><tr>
<td style="background:linear-gradient(135deg,#F97316,#EA580C);width:36px;height:36px;border-radius:8px;text-align:center;vertical-align:middle;color:#fff;font-weight:800;font-size:18px;line-height:36px">C</td>
<td style="padding-left:10px;color:#FAFAFA;font-size:20px;font-weight:700;letter-spacing:-0.5px">Cantaia</td>
</tr></table>
</td></tr>
<tr><td style="padding:32px">
<h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#18181B">${params.inviterName}</h1>
<p style="margin:0 0 24px;font-size:15px;color:#52525B">${locale === "de" ? "lädt Sie ein, beizutreten" : locale === "en" ? "invites you to join" : "vous invite à rejoindre"} <strong style="color:#18181B">${params.organizationName}</strong></p>
<table cellpadding="0" cellspacing="0" style="margin-bottom:24px"><tr>
<td style="background:#FFF7ED;border:1px solid #FDBA74;border-radius:6px;padding:6px 14px;font-size:13px;color:#C2410C;font-weight:600">${roleLabel}</td>
</tr></table>
${params.message ? `<div style="background:#F4F4F5;border-radius:8px;padding:16px;margin-bottom:24px;font-size:14px;color:#3F3F46;font-style:italic">"${params.message}"</div>` : ""}
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<a href="${inviteUrl}" style="display:inline-block;background:linear-gradient(135deg,#F97316,#EA580C);color:#FFFFFF;font-size:16px;font-weight:700;padding:14px 40px;border-radius:8px;text-decoration:none">${ctaLabel} ${params.organizationName} →</a>
</td></tr></table>
</td></tr>
<tr><td style="padding:0 32px 24px;text-align:center">
<p style="margin:0;font-size:12px;color:#A1A1AA">${expiresLabel}</p>
<p style="margin:8px 0 0;font-size:11px;color:#D4D4D8">Cantaia — ${locale === "de" ? "KI-gestützte Baustellenverwaltung" : locale === "en" ? "AI-powered construction management" : "L'IA au service du chantier"}</p>
</td></tr>
</table>
</td></tr></table></body></html>`;
}

export async function sendInviteEmail(params: InviteEmailParams): Promise<{ success: boolean; error?: string }> {
  try {
    const { Resend } = await import("resend") as { Resend: new (key: string) => { emails: { send: (opts: { from: string; to: string; subject: string; html: string }) => Promise<unknown> } } };
    const resend = new Resend(params.resendApiKey);
    const locale = params.locale || "fr";
    const getSubject = SUBJECTS[locale] || SUBJECTS.fr;

    await resend.emails.send({
      from: "Cantaia <invitations@cantaia.io>",
      to: params.inviteeEmail,
      subject: getSubject(params.inviterName, params.organizationName),
      html: buildInviteEmailHtml(params),
    });
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[invite-email] Failed to send:", message);
    return { success: false, error: message };
  }
}
