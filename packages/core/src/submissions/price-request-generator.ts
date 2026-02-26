// ============================================================
// Cantaia — Price Request Email Generator
// Generate multilingual price request emails from submission data
// ============================================================

export interface PriceRequestContext {
  supplier_name: string;
  contact_name: string;
  project_name: string;
  submission_title: string;
  submission_reference: string;
  lots: { name: string; cfc_code: string; item_count: number }[];
  deadline: string; // ISO date
  sender_name: string;
  sender_company: string;
  language: "fr" | "en" | "de";
}

export interface GeneratedPriceRequest {
  subject: string;
  body: string;
  language: "fr" | "en" | "de";
}

const TEMPLATES: Record<"fr" | "en" | "de", { subject: string; body: string }> = {
  fr: {
    subject: "Demande de prix — {submission_reference} — {project_name}",
    body: `Madame, Monsieur {contact_name},

Dans le cadre du projet **{project_name}**, nous avons le plaisir de vous inviter à nous soumettre une offre pour les lots suivants :

{lots_list}

**Référence soumission** : {submission_reference}
**Titre** : {submission_title}
**Date limite de réponse** : {deadline}

Vous trouverez ci-joint le descriptif complet des postes. Merci de nous retourner votre offre détaillée (prix unitaires et totaux par poste) avant la date limite indiquée.

Pour toute question technique, n'hésitez pas à nous contacter.

Cordialement,
{sender_name}
{sender_company}`,
  },
  en: {
    subject: "Price Request — {submission_reference} — {project_name}",
    body: `Dear {contact_name},

As part of the **{project_name}** project, we are pleased to invite you to submit an offer for the following lots:

{lots_list}

**Submission Reference**: {submission_reference}
**Title**: {submission_title}
**Response Deadline**: {deadline}

Please find attached the complete specification of items. We kindly ask you to return your detailed offer (unit and total prices per item) before the deadline.

For any technical questions, please do not hesitate to contact us.

Best regards,
{sender_name}
{sender_company}`,
  },
  de: {
    subject: "Preisanfrage — {submission_reference} — {project_name}",
    body: `Sehr geehrte(r) {contact_name},

Im Rahmen des Projekts **{project_name}** laden wir Sie ein, uns ein Angebot für folgende Lose zu unterbreiten:

{lots_list}

**Submission-Referenz**: {submission_reference}
**Titel**: {submission_title}
**Antwortfrist**: {deadline}

Anbei finden Sie die vollständige Beschreibung der Positionen. Wir bitten Sie, Ihr detailliertes Angebot (Einheits- und Gesamtpreise pro Position) vor Ablauf der Frist einzureichen.

Für technische Fragen stehen wir Ihnen gerne zur Verfügung.

Mit freundlichen Grüssen,
{sender_name}
{sender_company}`,
  },
};

/**
 * Generate a price request email from template
 */
export function generatePriceRequestEmail(ctx: PriceRequestContext): GeneratedPriceRequest {
  const template = TEMPLATES[ctx.language];

  const lotsListItems = ctx.lots.map(
    (l) => `- **${l.name}** (CFC ${l.cfc_code}) — ${l.item_count} postes`
  );

  const formattedDeadline = new Date(ctx.deadline).toLocaleDateString(
    ctx.language === "fr" ? "fr-CH" : ctx.language === "de" ? "de-CH" : "en-GB",
    { day: "numeric", month: "long", year: "numeric" }
  );

  const replacements: Record<string, string> = {
    "{contact_name}": ctx.contact_name,
    "{project_name}": ctx.project_name,
    "{submission_title}": ctx.submission_title,
    "{submission_reference}": ctx.submission_reference,
    "{deadline}": formattedDeadline,
    "{sender_name}": ctx.sender_name,
    "{sender_company}": ctx.sender_company,
    "{lots_list}": lotsListItems.join("\n"),
  };

  let subject = template.subject;
  let body = template.body;

  for (const [key, value] of Object.entries(replacements)) {
    subject = subject.replaceAll(key, value);
    body = body.replaceAll(key, value);
  }

  return { subject, body, language: ctx.language };
}

/**
 * Generate reminder email templates
 */
export function generateReminderEmail(
  roundNumber: 1 | 2 | 3,
  ctx: Pick<PriceRequestContext, "supplier_name" | "contact_name" | "project_name" | "submission_reference" | "deadline" | "sender_name" | "sender_company" | "language">
): GeneratedPriceRequest {
  const lang = ctx.language;
  const formattedDeadline = new Date(ctx.deadline).toLocaleDateString(
    lang === "fr" ? "fr-CH" : lang === "de" ? "de-CH" : "en-GB",
    { day: "numeric", month: "long", year: "numeric" }
  );

  const reminders: Record<1 | 2 | 3, Record<"fr" | "en" | "de", { subject: string; body: string }>> = {
    1: {
      fr: {
        subject: `Rappel — Demande de prix ${ctx.submission_reference}`,
        body: `Madame, Monsieur ${ctx.contact_name},\n\nNous nous permettons de vous rappeler notre demande de prix pour le projet **${ctx.project_name}** (réf. ${ctx.submission_reference}).\n\nLa date limite de réponse est fixée au **${formattedDeadline}**.\n\nNous restons à votre disposition pour toute question.\n\nCordialement,\n${ctx.sender_name}\n${ctx.sender_company}`,
      },
      en: {
        subject: `Reminder — Price Request ${ctx.submission_reference}`,
        body: `Dear ${ctx.contact_name},\n\nWe would like to kindly remind you of our price request for the project **${ctx.project_name}** (ref. ${ctx.submission_reference}).\n\nThe response deadline is **${formattedDeadline}**.\n\nPlease do not hesitate to contact us with any questions.\n\nBest regards,\n${ctx.sender_name}\n${ctx.sender_company}`,
      },
      de: {
        subject: `Erinnerung — Preisanfrage ${ctx.submission_reference}`,
        body: `Sehr geehrte(r) ${ctx.contact_name},\n\nWir möchten Sie an unsere Preisanfrage für das Projekt **${ctx.project_name}** (Ref. ${ctx.submission_reference}) erinnern.\n\nDie Antwortfrist ist der **${formattedDeadline}**.\n\nFür Fragen stehen wir Ihnen gerne zur Verfügung.\n\nMit freundlichen Grüssen,\n${ctx.sender_name}\n${ctx.sender_company}`,
      },
    },
    2: {
      fr: {
        subject: `Relance urgente — ${ctx.submission_reference} — ${ctx.project_name}`,
        body: `Madame, Monsieur ${ctx.contact_name},\n\nSuite à notre demande de prix (réf. ${ctx.submission_reference}), nous n'avons pas encore reçu votre offre.\n\nLa date limite approche : **${formattedDeadline}**. Nous vous serions reconnaissants de nous transmettre votre offre dans les meilleurs délais.\n\nCordialement,\n${ctx.sender_name}\n${ctx.sender_company}`,
      },
      en: {
        subject: `Urgent reminder — ${ctx.submission_reference} — ${ctx.project_name}`,
        body: `Dear ${ctx.contact_name},\n\nFollowing our price request (ref. ${ctx.submission_reference}), we have not yet received your offer.\n\nThe deadline is approaching: **${formattedDeadline}**. We would appreciate receiving your offer as soon as possible.\n\nBest regards,\n${ctx.sender_name}\n${ctx.sender_company}`,
      },
      de: {
        subject: `Dringende Erinnerung — ${ctx.submission_reference} — ${ctx.project_name}`,
        body: `Sehr geehrte(r) ${ctx.contact_name},\n\nNach unserer Preisanfrage (Ref. ${ctx.submission_reference}) haben wir Ihr Angebot noch nicht erhalten.\n\nDie Frist nähert sich: **${formattedDeadline}**. Wir wären Ihnen dankbar, wenn Sie uns Ihr Angebot so bald wie möglich zukommen lassen.\n\nMit freundlichen Grüssen,\n${ctx.sender_name}\n${ctx.sender_company}`,
      },
    },
    3: {
      fr: {
        subject: `Dernière relance — ${ctx.submission_reference}`,
        body: `Madame, Monsieur ${ctx.contact_name},\n\nCeci est notre dernier rappel concernant la demande de prix ${ctx.submission_reference} pour le projet **${ctx.project_name}**.\n\nSans réponse de votre part avant le **${formattedDeadline}**, nous considérerons que vous ne souhaitez pas donner suite à cette consultation.\n\nCordialement,\n${ctx.sender_name}\n${ctx.sender_company}`,
      },
      en: {
        subject: `Final reminder — ${ctx.submission_reference}`,
        body: `Dear ${ctx.contact_name},\n\nThis is our final reminder regarding the price request ${ctx.submission_reference} for the project **${ctx.project_name}**.\n\nWithout a response by **${formattedDeadline}**, we will consider that you do not wish to participate in this tender.\n\nBest regards,\n${ctx.sender_name}\n${ctx.sender_company}`,
      },
      de: {
        subject: `Letzte Erinnerung — ${ctx.submission_reference}`,
        body: `Sehr geehrte(r) ${ctx.contact_name},\n\nDies ist unsere letzte Erinnerung bezüglich der Preisanfrage ${ctx.submission_reference} für das Projekt **${ctx.project_name}**.\n\nOhne Antwort bis zum **${formattedDeadline}** gehen wir davon aus, dass Sie an dieser Ausschreibung nicht teilnehmen möchten.\n\nMit freundlichen Grüssen,\n${ctx.sender_name}\n${ctx.sender_company}`,
      },
    },
  };

  const template = reminders[roundNumber][lang];
  return { subject: template.subject, body: template.body, language: lang };
}
