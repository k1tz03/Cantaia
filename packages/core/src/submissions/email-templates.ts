// ============================================================
// Cantaia — Supplier email templates (FR / DE / EN)
//
// Every email Cantaia sends to a supplier goes through this module:
//   - price request      (demande de prix / Preisanfrage)
//   - reminder           (relance / Erinnerung)
//   - award confirmation (adjudication / Zuschlag)
//   - rejection          (lettre de refus / Absage)
//
// `submission_price_requests.language` selects the locale; `fr` is the
// default and the fallback for any unknown value. Dates are formatted with
// the matching Swiss locale (fr-CH / de-CH / en-CH).
//
// The rendered `html` is a fragment (no <html>/<body>) because it is handed
// straight to Microsoft Graph as `body.content` with contentType "HTML".
// ============================================================

export type SupplierLanguage = "fr" | "de" | "en";

const LOCALE_TAG: Record<SupplierLanguage, string> = {
  fr: "fr-CH",
  de: "de-CH",
  en: "en-CH",
};

/** Narrow any incoming value to a supported language, defaulting to French. */
export function normalizeSupplierLanguage(value: unknown): SupplierLanguage {
  return value === "de" || value === "en" ? value : "fr";
}

/** Long, localized date — "12 mars 2026" / "12. März 2026" / "12 March 2026". */
export function formatSupplierDate(
  date: string | Date | null | undefined,
  language: SupplierLanguage
): string | null {
  if (!date) return null;
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(LOCALE_TAG[language], {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Localized number with Swiss thousand separators. */
export function formatSupplierNumber(
  value: number | null | undefined,
  language: SupplierLanguage,
  fractionDigits = 2
): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString(LOCALE_TAG[language], {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

/**
 * Escape a value interpolated into outgoing HTML.
 * Item descriptions and supplier names come from parsed documents — an
 * unescaped `<` is enough to break (or inject into) the markup of a mail
 * sent from the user's own mailbox.
 */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ─────────────────────────────────────────────────────────────
// Strings
// ─────────────────────────────────────────────────────────────

interface Strings {
  greeting: (firstName: string | null) => string;
  closing: string;

  // Items table
  colNumber: string;
  colDescription: string;
  colUnit: string;
  colQuantity: string;
  colUnitPrice: string;
  colTotal: string;

  // Price request
  // `code` = SUB- tracking code appended as "[SUB-…]" — having it in the
  // SUBJECT survives supplier replies that quote nothing of the body, which
  // is what the L0b auto-reception matches on.
  prSubject: (project: string, group: string, code?: string) => string;
  prIntro: (project: string, group: string) => string;
  prDeadline: (deadline: string | null) => string;
  prPortalTitle: string;
  prPortalBody: string;
  prPortalCta: string;
  prPortalOrEmail: string;
  prTracking: (code: string) => string;
  prAvailable: string;

  // Reminder
  reSubject: (n: number, project: string, group: string, code?: string) => string;
  reIntro: (project: string, group: string) => string;
  reDeadlineReminder: (deadline: string) => string;
  reAsk: string;
  reReference: (code: string) => string;

  // Award
  awSubject: (project: string, group: string) => string;
  awIntro: (project: string, group: string) => string;
  awOrderAttached: (reference: string) => string;
  awTotal: (amount: string) => string;
  awNext: string;

  // Rejection
  rjSubject: (project: string, group: string) => string;
  rjIntro: (project: string, group: string) => string;
  rjDecision: string;
  rjThanks: string;

  // Purchase order PDF
  poTitle: string;
  poNumber: string;
  poDate: string;
  poSupplier: string;
  poProject: string;
  poGroup: string;
  poDeliveryDate: string;
  poSubtotal: string;
  poNoVat: string;
  poConditions: string;
  poFooter: string;
}

const FR: Strings = {
  greeting: (n) => (n ? `Bonjour ${n}` : "Bonjour"),
  closing: "Cordialement,",

  colNumber: "N°",
  colDescription: "Description",
  colUnit: "Unité",
  colQuantity: "Quantité",
  colUnitPrice: "PU HT",
  colTotal: "Total HT",

  prSubject: (p, g, c) => `Demande de prix — ${p} — ${g}${c ? ` [${c}]` : ""}`,
  prIntro: (p, g) =>
    `Dans le cadre du projet <strong>${escapeHtml(p)}</strong>, nous vous sollicitons pour une offre de prix concernant les postes suivants (<strong>${escapeHtml(g)}</strong>) :`,
  prDeadline: (d) =>
    d
      ? `Merci de nous transmettre votre offre de prix unitaires HT pour ces postes, <strong>avant le ${escapeHtml(d)}</strong>.`
      : "Merci de nous transmettre votre offre de prix unitaires HT pour ces postes dans les meilleurs délais.",
  prPortalTitle: "Répondre en ligne",
  prPortalBody:
    "Saisissez vos prix directement en ligne : le formulaire reprend les postes ci-dessus, aucun compte n'est nécessaire.",
  prPortalCta: "Saisir mon offre",
  prPortalOrEmail:
    "Vous préférez répondre par email ou joindre votre propre offre ? Répondez simplement à ce message.",
  prTracking: (c) =>
    `<strong>Important :</strong> si vous répondez par email, merci de conserver le code <strong>${escapeHtml(c)}</strong> dans votre réponse ou en objet de mail, afin de faciliter le traitement de votre offre.`,
  prAvailable: "Nous restons à votre disposition pour tout renseignement complémentaire.",

  reSubject: (n, p, g, c) =>
    `Relance${n > 1 ? ` n°${n}` : ""} — Demande de prix — ${p} — ${g}${c ? ` [${c}]` : ""}`,
  reIntro: (p, g) =>
    `Nous nous permettons de revenir vers vous concernant notre demande de prix pour le projet <strong>${escapeHtml(p)}</strong>, groupe <strong>${escapeHtml(g)}</strong>.`,
  reDeadlineReminder: (d) =>
    `Pour rappel, le délai de réponse souhaité était fixé au <strong>${escapeHtml(d)}</strong>.`,
  reAsk: "Nous vous serions reconnaissants de bien vouloir nous faire parvenir votre offre dans les meilleurs délais.",
  reReference: (c) =>
    `<strong>Référence :</strong> ${escapeHtml(c)}<br/>Merci de mentionner ce code dans votre réponse.`,

  awSubject: (p, g) => `Adjudication — ${p} — ${g}`,
  awIntro: (p, g) =>
    `Nous avons le plaisir de vous informer que votre offre pour le projet <strong>${escapeHtml(p)}</strong>, groupe <strong>${escapeHtml(g)}</strong>, a été retenue.`,
  awOrderAttached: (r) =>
    `Vous trouverez en pièce jointe le bon de commande correspondant (référence <strong>${escapeHtml(r)}</strong>).`,
  awTotal: (a) => `Montant total de la commande : <strong>${escapeHtml(a)} CHF HT</strong>.`,
  awNext:
    "Merci de nous confirmer la bonne réception de cette commande ainsi que les délais de livraison prévus.",

  rjSubject: (p, g) => `Suite donnée à votre offre — ${p} — ${g}`,
  rjIntro: (p, g) =>
    `Nous vous remercions pour l'offre que vous nous avez transmise concernant le projet <strong>${escapeHtml(p)}</strong>, groupe <strong>${escapeHtml(g)}</strong>.`,
  rjDecision:
    "Après analyse comparative des offres reçues, nous avons retenu une autre proposition pour ce lot.",
  rjThanks:
    "Nous vous remercions pour le temps consacré à l'établissement de votre offre et espérons pouvoir collaborer avec vous lors d'un prochain projet.",

  poTitle: "BON DE COMMANDE",
  poNumber: "N° de commande",
  poDate: "Date",
  poSupplier: "Fournisseur",
  poProject: "Projet",
  poGroup: "Lot / Groupe",
  poDeliveryDate: "Délai souhaité",
  poSubtotal: "Total HT",
  poNoVat: "Montants hors taxes, en francs suisses (CHF).",
  poConditions: "Conditions",
  poFooter: "Bon de commande généré par Cantaia",
};

const DE: Strings = {
  greeting: (n) => (n ? `Guten Tag ${n}` : "Guten Tag"),
  closing: "Freundliche Grüsse,",

  colNumber: "Nr.",
  colDescription: "Bezeichnung",
  colUnit: "Einheit",
  colQuantity: "Menge",
  colUnitPrice: "EP exkl. MwSt.",
  colTotal: "Total exkl. MwSt.",

  prSubject: (p, g, c) => `Preisanfrage — ${p} — ${g}${c ? ` [${c}]` : ""}`,
  prIntro: (p, g) =>
    `Im Rahmen des Projekts <strong>${escapeHtml(p)}</strong> bitten wir Sie um eine Preisofferte für die folgenden Positionen (<strong>${escapeHtml(g)}</strong>):`,
  prDeadline: (d) =>
    d
      ? `Bitte lassen Sie uns Ihre Einheitspreise (exkl. MwSt.) für diese Positionen <strong>bis zum ${escapeHtml(d)}</strong> zukommen.`
      : "Bitte lassen Sie uns Ihre Einheitspreise (exkl. MwSt.) für diese Positionen baldmöglichst zukommen.",
  prPortalTitle: "Online antworten",
  prPortalBody:
    "Erfassen Sie Ihre Preise direkt online: das Formular enthält die oben aufgeführten Positionen, ein Konto ist nicht erforderlich.",
  prPortalCta: "Offerte erfassen",
  prPortalOrEmail:
    "Möchten Sie lieber per E-Mail antworten oder Ihre eigene Offerte anhängen? Antworten Sie einfach auf diese Nachricht.",
  prTracking: (c) =>
    `<strong>Wichtig:</strong> Falls Sie per E-Mail antworten, behalten Sie bitte den Code <strong>${escapeHtml(c)}</strong> in Ihrer Antwort oder im Betreff, damit wir Ihre Offerte korrekt zuordnen können.`,
  prAvailable: "Für weitere Auskünfte stehen wir Ihnen gerne zur Verfügung.",

  reSubject: (n, p, g, c) =>
    `Erinnerung${n > 1 ? ` Nr. ${n}` : ""} — Preisanfrage — ${p} — ${g}${c ? ` [${c}]` : ""}`,
  reIntro: (p, g) =>
    `Wir erlauben uns, auf unsere Preisanfrage für das Projekt <strong>${escapeHtml(p)}</strong>, Los <strong>${escapeHtml(g)}</strong>, zurückzukommen.`,
  reDeadlineReminder: (d) =>
    `Zur Erinnerung: die gewünschte Antwortfrist war auf den <strong>${escapeHtml(d)}</strong> festgelegt.`,
  reAsk: "Wir wären Ihnen dankbar, wenn Sie uns Ihre Offerte baldmöglichst zustellen könnten.",
  reReference: (c) =>
    `<strong>Referenz:</strong> ${escapeHtml(c)}<br/>Bitte erwähnen Sie diesen Code in Ihrer Antwort.`,

  awSubject: (p, g) => `Zuschlag — ${p} — ${g}`,
  awIntro: (p, g) =>
    `Gerne teilen wir Ihnen mit, dass Ihre Offerte für das Projekt <strong>${escapeHtml(p)}</strong>, Los <strong>${escapeHtml(g)}</strong>, berücksichtigt wurde.`,
  awOrderAttached: (r) =>
    `Die entsprechende Bestellung finden Sie im Anhang (Referenz <strong>${escapeHtml(r)}</strong>).`,
  awTotal: (a) => `Gesamtbetrag der Bestellung: <strong>${escapeHtml(a)} CHF exkl. MwSt.</strong>`,
  awNext:
    "Bitte bestätigen Sie uns den Erhalt dieser Bestellung sowie die vorgesehenen Liefertermine.",

  rjSubject: (p, g) => `Rückmeldung zu Ihrer Offerte — ${p} — ${g}`,
  rjIntro: (p, g) =>
    `Wir danken Ihnen für die Offerte, die Sie uns für das Projekt <strong>${escapeHtml(p)}</strong>, Los <strong>${escapeHtml(g)}</strong>, zugestellt haben.`,
  rjDecision:
    "Nach dem Vergleich der eingegangenen Offerten haben wir uns für ein anderes Angebot entschieden.",
  rjThanks:
    "Wir danken Ihnen für den Aufwand bei der Erstellung Ihrer Offerte und freuen uns auf eine Zusammenarbeit bei einem nächsten Projekt.",

  poTitle: "BESTELLUNG",
  poNumber: "Bestellnummer",
  poDate: "Datum",
  poSupplier: "Lieferant",
  poProject: "Projekt",
  poGroup: "Los / Gruppe",
  poDeliveryDate: "Gewünschter Termin",
  poSubtotal: "Total exkl. MwSt.",
  poNoVat: "Beträge exklusive MwSt., in Schweizer Franken (CHF).",
  poConditions: "Bedingungen",
  poFooter: "Bestellung erstellt mit Cantaia",
};

const EN: Strings = {
  greeting: (n) => (n ? `Hello ${n}` : "Hello"),
  closing: "Kind regards,",

  colNumber: "No.",
  colDescription: "Description",
  colUnit: "Unit",
  colQuantity: "Quantity",
  colUnitPrice: "Unit price excl. VAT",
  colTotal: "Total excl. VAT",

  prSubject: (p, g, c) => `Request for quotation — ${p} — ${g}${c ? ` [${c}]` : ""}`,
  prIntro: (p, g) =>
    `For the project <strong>${escapeHtml(p)}</strong>, we would like to request a quotation for the following items (<strong>${escapeHtml(g)}</strong>):`,
  prDeadline: (d) =>
    d
      ? `Please send us your unit prices (excl. VAT) for these items <strong>before ${escapeHtml(d)}</strong>.`
      : "Please send us your unit prices (excl. VAT) for these items at your earliest convenience.",
  prPortalTitle: "Answer online",
  prPortalBody:
    "Enter your prices directly online: the form lists the items above, no account required.",
  prPortalCta: "Submit my quotation",
  prPortalOrEmail:
    "Prefer to answer by email or attach your own quotation? Simply reply to this message.",
  prTracking: (c) =>
    `<strong>Important:</strong> if you answer by email, please keep the reference <strong>${escapeHtml(c)}</strong> in your reply or in the subject line so we can process your quotation.`,
  prAvailable: "We remain at your disposal for any further information.",

  reSubject: (n, p, g, c) =>
    `Reminder${n > 1 ? ` #${n}` : ""} — Request for quotation — ${p} — ${g}${c ? ` [${c}]` : ""}`,
  reIntro: (p, g) =>
    `We are following up on our request for quotation for the project <strong>${escapeHtml(p)}</strong>, lot <strong>${escapeHtml(g)}</strong>.`,
  reDeadlineReminder: (d) => `As a reminder, the requested response date was <strong>${escapeHtml(d)}</strong>.`,
  reAsk: "We would be grateful to receive your quotation at your earliest convenience.",
  reReference: (c) =>
    `<strong>Reference:</strong> ${escapeHtml(c)}<br/>Please mention this code in your reply.`,

  awSubject: (p, g) => `Award — ${p} — ${g}`,
  awIntro: (p, g) =>
    `We are pleased to inform you that your quotation for the project <strong>${escapeHtml(p)}</strong>, lot <strong>${escapeHtml(g)}</strong>, has been selected.`,
  awOrderAttached: (r) =>
    `Please find the corresponding purchase order attached (reference <strong>${escapeHtml(r)}</strong>).`,
  awTotal: (a) => `Total order amount: <strong>${escapeHtml(a)} CHF excl. VAT</strong>.`,
  awNext: "Please confirm receipt of this order along with the expected delivery dates.",

  rjSubject: (p, g) => `Outcome of your quotation — ${p} — ${g}`,
  rjIntro: (p, g) =>
    `Thank you for the quotation you sent us for the project <strong>${escapeHtml(p)}</strong>, lot <strong>${escapeHtml(g)}</strong>.`,
  rjDecision:
    "After comparing the quotations received, we have selected another offer for this lot.",
  rjThanks:
    "We appreciate the time you invested in preparing your quotation and hope to work with you on a future project.",

  poTitle: "PURCHASE ORDER",
  poNumber: "Order no.",
  poDate: "Date",
  poSupplier: "Supplier",
  poProject: "Project",
  poGroup: "Lot / Group",
  poDeliveryDate: "Requested date",
  poSubtotal: "Total excl. VAT",
  poNoVat: "Amounts excluding VAT, in Swiss francs (CHF).",
  poConditions: "Terms",
  poFooter: "Purchase order generated with Cantaia",
};

const STRINGS: Record<SupplierLanguage, Strings> = { fr: FR, de: DE, en: EN };

/** Full string table for a language — also used by the purchase-order PDF. */
export function supplierStrings(language: SupplierLanguage): Strings {
  return STRINGS[language] || FR;
}

// ─────────────────────────────────────────────────────────────
// Shared fragments
// ─────────────────────────────────────────────────────────────

export interface TemplateItem {
  item_number?: string | null;
  description?: string | null;
  unit?: string | null;
  quantity?: number | string | null;
  unit_price_ht?: number | null;
}

type Align = "left" | "center" | "right";
const td = (align: Align = "left") =>
  `style="padding:4px 8px;border:1px solid #ddd;text-align:${align};"`;
const th = (align: Align = "left") =>
  `style="padding:6px 8px;border:1px solid #ddd;text-align:${align};"`;

/**
 * Strip service/labour phrases irrelevant to a supplier — they only quote the
 * material. Swiss descriptions routinely bundle "fourniture et pose",
 * "Lieferung und Montage", "y compris …".
 */
export function cleanDescriptionForSupplier(desc: string): string {
  let cleaned = desc;
  cleaned = cleaned.replace(/^(?:fourniture\s+et\s+(?:pose|mise\s+en\s+(?:place|œuvre|oeuvre))\s+(?:de\s+|d['’])?)/i, "");
  cleaned = cleaned.replace(/^(?:livraison\s+et\s+(?:pose|mise\s+en\s+(?:place|œuvre|oeuvre))\s+(?:de\s+|d['’])?)/i, "");
  cleaned = cleaned.replace(/^(?:fourniture,?\s+(?:transport\s+et\s+)?(?:pose|mise\s+en\s+(?:place|œuvre|oeuvre))\s+(?:de\s+|d['’])?)/i, "");
  cleaned = cleaned.replace(/^(?:Lieferung\s+und\s+(?:Montage|Verlegung|Einbau)\s+(?:von\s+)?)/i, "");
  cleaned = cleaned.replace(/[,;]\s*(?:y\s+compris|incl(?:us|uant)?|inkl(?:usive)?|einschliesslich)\s+.{0,80}$/i, "");
  cleaned = cleaned.replace(/\s+et\s+(?:pose|mise\s+en\s+(?:place|œuvre|oeuvre))$/i, "");
  cleaned = cleaned.replace(/\s+und\s+(?:Montage|Verlegung|Einbau)$/i, "");
  cleaned = cleaned.trim();
  if (cleaned.length > 0) cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  return cleaned.length >= 10 ? cleaned : desc;
}

/** Localized items table. Adds price columns when `withPrices` is set. */
export function renderItemsTable(
  items: TemplateItem[],
  language: SupplierLanguage,
  withPrices = false
): string {
  const s = supplierStrings(language);

  const rows = items
    .map((i) => {
      const rawQty = i.quantity != null && i.quantity !== "" ? Number(i.quantity) : null;
      const qty = rawQty != null && Number.isFinite(rawQty) ? rawQty : null;
      const base =
        `<tr>` +
        `<td ${td()}>${escapeHtml(i.item_number || "-")}</td>` +
        `<td ${td()}>${escapeHtml(cleanDescriptionForSupplier(i.description || ""))}</td>` +
        `<td ${td("center")}>${escapeHtml(i.unit || "-")}</td>` +
        `<td ${td("right")}>${qty != null ? formatSupplierNumber(qty, language, 0) : "-"}</td>`;
      if (!withPrices) return `${base}</tr>`;
      const pu = i.unit_price_ht ?? null;
      const total = pu != null && qty != null ? pu * qty : null;
      return (
        base +
        `<td ${td("right")}>${formatSupplierNumber(pu, language)}</td>` +
        `<td ${td("right")}>${formatSupplierNumber(total, language)}</td>` +
        `</tr>`
      );
    })
    .join("\n");

  const priceHeaders = withPrices
    ? `<th ${th("right")}>${escapeHtml(s.colUnitPrice)}</th><th ${th("right")}>${escapeHtml(s.colTotal)}</th>`
    : "";

  return `<table style="border-collapse:collapse;width:100%;font-size:13px;margin:16px 0;">
  <thead>
    <tr style="background:#f3f4f6;">
      <th ${th()}>${escapeHtml(s.colNumber)}</th>
      <th ${th()}>${escapeHtml(s.colDescription)}</th>
      <th ${th("center")}>${escapeHtml(s.colUnit)}</th>
      <th ${th("right")}>${escapeHtml(s.colQuantity)}</th>
      ${priceHeaders}
    </tr>
  </thead>
  <tbody>
${rows}
  </tbody>
</table>`;
}

/** Big call-to-action button pointing at the supplier portal. */
export function renderPortalBlock(portalUrl: string, language: SupplierLanguage): string {
  const s = supplierStrings(language);
  return `<div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:16px;margin:20px 0;">
  <p style="margin:0 0 6px 0;font-size:14px;font-weight:600;color:#0c4a6e;">${escapeHtml(s.prPortalTitle)}</p>
  <p style="margin:0 0 12px 0;font-size:13px;color:#0369a1;">${escapeHtml(s.prPortalBody)}</p>
  <a href="${escapeHtml(portalUrl)}" style="display:inline-block;background:#F97316;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 20px;border-radius:6px;">${escapeHtml(s.prPortalCta)}</a>
  <p style="margin:12px 0 0 0;font-size:12px;color:#64748b;">${escapeHtml(s.prPortalOrEmail)}</p>
</div>`;
}

interface SignatureOpts {
  senderName?: string | null;
  senderTitle?: string | null;
  senderCompany?: string | null;
  /** Rich HTML authored in Settings → Profile. Intentionally NOT escaped. */
  emailSignature?: string | null;
}

export function renderSignature(opts: SignatureOpts, language: SupplierLanguage): string {
  const s = supplierStrings(language);
  if (opts.emailSignature?.trim()) {
    return `<p>--<br/>${opts.emailSignature.replace(/\n/g, "<br/>")}</p>`;
  }
  // Never emit an empty <strong></strong> when no sender name is available.
  const nameLine = opts.senderName?.trim()
    ? `<br/>\n<strong>${escapeHtml(opts.senderName.trim())}</strong>`
    : "";
  const titleLine = opts.senderTitle ? `<br/>${escapeHtml(opts.senderTitle)}` : "";
  const companyLine = opts.senderCompany?.trim()
    ? `<br/>\n${escapeHtml(opts.senderCompany.trim())}`
    : "";
  return `<p>${escapeHtml(s.closing)}${nameLine}${titleLine}${companyLine}</p>`;
}

// ─────────────────────────────────────────────────────────────
// 1. Price request
// ─────────────────────────────────────────────────────────────

export interface PriceRequestEmailOptions extends SignatureOpts {
  contactName?: string | null;
  projectName: string;
  materialGroup: string;
  items: TemplateItem[];
  trackingCode: string;
  /** Absolute URL of the supplier portal. Omitted → no portal block. */
  portalUrl?: string | null;
  deadline?: string | null;
  language?: SupplierLanguage;
}

export function buildPriceRequestEmail(opts: PriceRequestEmailOptions): {
  subject: string;
  html: string;
} {
  const language = normalizeSupplierLanguage(opts.language);
  const s = supplierStrings(language);
  const firstName = opts.contactName?.split(/\s+/)[0] || null;
  const deadlineStr = formatSupplierDate(opts.deadline, language);

  const html = `
<p>${escapeHtml(s.greeting(firstName))},</p>

<p>${s.prIntro(opts.projectName, opts.materialGroup)}</p>

${renderItemsTable(opts.items, language)}

<p>${s.prDeadline(deadlineStr)}</p>

${opts.portalUrl ? renderPortalBlock(opts.portalUrl, language) : ""}

<p style="background:#f0f9ff;padding:12px;border-radius:6px;border-left:4px solid #3b82f6;margin:16px 0;">
  ${s.prTracking(opts.trackingCode)}
</p>

<p>${escapeHtml(s.prAvailable)}</p>

${renderSignature(opts, language)}
`.trim();

  return {
    subject: s.prSubject(opts.projectName, opts.materialGroup, opts.trackingCode),
    html,
  };
}

// ─────────────────────────────────────────────────────────────
// 2. Reminder (relance)
// ─────────────────────────────────────────────────────────────

export interface ReminderEmailOptions extends SignatureOpts {
  contactName?: string | null;
  projectName: string;
  materialGroup: string;
  trackingCode: string;
  relanceNumber: number;
  deadline?: string | null;
  portalUrl?: string | null;
  language?: SupplierLanguage;
}

export function buildReminderEmail(opts: ReminderEmailOptions): {
  subject: string;
  html: string;
} {
  const language = normalizeSupplierLanguage(opts.language);
  const s = supplierStrings(language);
  const firstName = opts.contactName?.split(/\s+/)[0] || null;
  const deadlineStr = formatSupplierDate(opts.deadline, language);

  const html = `
<p>${escapeHtml(s.greeting(firstName))},</p>

<p>${s.reIntro(opts.projectName, opts.materialGroup)}</p>

${deadlineStr ? `<p>${s.reDeadlineReminder(deadlineStr)}</p>` : ""}

${opts.portalUrl ? renderPortalBlock(opts.portalUrl, language) : ""}

<p style="background:#fef3c7;padding:12px;border-radius:6px;border-left:4px solid #f59e0b;margin:16px 0;">
  ${s.reReference(opts.trackingCode)}
</p>

<p>${escapeHtml(s.reAsk)}</p>

${renderSignature(opts, language)}
`.trim();

  return {
    subject: s.reSubject(
      opts.relanceNumber,
      opts.projectName,
      opts.materialGroup,
      opts.trackingCode
    ),
    html,
  };
}

// ─────────────────────────────────────────────────────────────
// 3. Award confirmation
// ─────────────────────────────────────────────────────────────

export interface AwardEmailOptions extends SignatureOpts {
  contactName?: string | null;
  projectName: string;
  materialGroup: string;
  orderReference: string;
  totalHt: number | null;
  items?: TemplateItem[];
  deadline?: string | null;
  language?: SupplierLanguage;
}

export function buildAwardEmail(opts: AwardEmailOptions): { subject: string; html: string } {
  const language = normalizeSupplierLanguage(opts.language);
  const s = supplierStrings(language);
  const firstName = opts.contactName?.split(/\s+/)[0] || null;

  const html = `
<p>${escapeHtml(s.greeting(firstName))},</p>

<p>${s.awIntro(opts.projectName, opts.materialGroup)}</p>

<p>${s.awOrderAttached(opts.orderReference)}</p>

${opts.totalHt != null ? `<p>${s.awTotal(formatSupplierNumber(opts.totalHt, language))}</p>` : ""}

${opts.items && opts.items.length > 0 ? renderItemsTable(opts.items, language, true) : ""}

<p>${escapeHtml(s.awNext)}</p>

${renderSignature(opts, language)}
`.trim();

  return { subject: s.awSubject(opts.projectName, opts.materialGroup), html };
}

// ─────────────────────────────────────────────────────────────
// 4. Rejection
// ─────────────────────────────────────────────────────────────

export interface RejectionEmailOptions extends SignatureOpts {
  contactName?: string | null;
  projectName: string;
  materialGroup: string;
  language?: SupplierLanguage;
}

export function buildRejectionEmail(opts: RejectionEmailOptions): {
  subject: string;
  html: string;
} {
  const language = normalizeSupplierLanguage(opts.language);
  const s = supplierStrings(language);
  const firstName = opts.contactName?.split(/\s+/)[0] || null;

  const html = `
<p>${escapeHtml(s.greeting(firstName))},</p>

<p>${s.rjIntro(opts.projectName, opts.materialGroup)}</p>

<p>${escapeHtml(s.rjDecision)}</p>

<p>${escapeHtml(s.rjThanks)}</p>

${renderSignature(opts, language)}
`.trim();

  return { subject: s.rjSubject(opts.projectName, opts.materialGroup), html };
}
