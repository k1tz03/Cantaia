"use client";

/**
 * PUBLIC — supplier offer portal.
 *
 *   /[locale]/offre/<portal_token>
 *
 * The supplier opens the link from the price-request email and types their unit
 * prices directly. No account, no Cantaia session: the opaque token in the URL
 * IS the credential, validated server-side by /api/supplier-portal/[token].
 *
 * LANGUAGE — deliberately NOT next-intl. The page speaks the language stored on
 * `submission_price_requests.language`, i.e. the language the email was written
 * in, which is what the supplier actually reads. Routing the copy through the
 * app locale would show French to a German supplier who happens to open the
 * link with an /fr/ prefix (exactly the bug the audit flagged). The dictionary
 * below is therefore local to this page, like the crew portal's own strings.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Paperclip,
  Send,
  X,
} from "lucide-react";

/* ═══════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════ */

type Lang = "fr" | "de" | "en";

interface PortalItem {
  id: string;
  item_number: string | null;
  description: string | null;
  unit: string | null;
  quantity: number | null;
  previous_unit_price_ht: number | null;
  previous_remarks: string | null;
}

interface PortalPayload {
  language: Lang;
  status: string;
  already_submitted: boolean;
  submitted_at: string | null;
  tracking_code: string | null;
  material_group: string | null;
  deadline: string | null;
  currency: string;
  project: { name: string | null; city: string | null };
  organization_name: string | null;
  supplier_name: string | null;
  contact_name: string | null;
  conditions_text: string | null;
  items: PortalItem[];
}

/* ═══════════════════════════════════════════════════════════════
   Strings
   ═══════════════════════════════════════════════════════════════ */

interface Strings {
  loading: string;
  notFoundTitle: string;
  notFoundBody: string;
  rateLimited: string;
  headerFor: string;
  fromLabel: string;
  supplierLabel: string;
  closedTitle: string;
  closedBodyAwarded: string;
  closedBodyDeadline: string;
  project: string;
  group: string;
  reference: string;
  deadline: string;
  intro: string;
  alreadyTitle: string;
  alreadyBody: (date: string) => string;
  edit: string;
  colNumber: string;
  colDescription: string;
  colUnit: string;
  colQuantity: string;
  colUnitPrice: string;
  colTotal: string;
  colRemarks: string;
  remarksPlaceholder: string;
  noPriceHint: string;
  contactLabel: string;
  contactPlaceholder: string;
  conditionsLabel: string;
  conditionsPlaceholder: string;
  attachmentLabel: string;
  attachmentHint: string;
  attachmentAdd: string;
  attachmentTooLarge: string;
  attachmentBadType: string;
  attachmentFailed: string;
  totalLabel: string;
  submit: string;
  submitting: string;
  successTitle: string;
  successBody: string;
  errorNoPrices: string;
  errorInvalidPrice: string;
  errorGeneric: string;
  vatNote: string;
  poweredBy: string;
}

const FR: Strings = {
  loading: "Chargement de la demande…",
  notFoundTitle: "Lien invalide ou expiré",
  notFoundBody:
    "Ce lien ne correspond à aucune demande de prix. Vérifiez l'adresse ou répondez directement à l'email reçu.",
  rateLimited: "Trop de tentatives. Réessayez dans quelques minutes.",
  headerFor: "Demande de prix",
  fromLabel: "De la part de",
  supplierLabel: "Fournisseur",
  closedTitle: "Cette consultation est clôturée",
  closedBodyAwarded:
    "Ce lot a été adjugé. Il n'est plus possible de transmettre ou de modifier une offre.",
  closedBodyDeadline:
    "Le délai de réponse est échu. Il n'est plus possible de transmettre ou de modifier une offre.",
  project: "Projet",
  group: "Lot",
  reference: "Référence",
  deadline: "Délai de réponse",
  intro:
    "Saisissez vos prix unitaires hors taxes pour les postes ci-dessous. Laissez la case vide pour un poste que vous ne chiffrez pas.",
  alreadyTitle: "Offre déjà transmise",
  alreadyBody: (d) => `Vous avez transmis votre offre le ${d}. Vous pouvez la corriger ci-dessous.`,
  edit: "Modifier mon offre",
  colNumber: "N°",
  colDescription: "Description",
  colUnit: "Unité",
  colQuantity: "Quantité",
  colUnitPrice: "PU HT",
  colTotal: "Total HT",
  colRemarks: "Remarque",
  remarksPlaceholder: "Variante, délai, condition…",
  noPriceHint: "Non chiffré",
  contactLabel: "Votre nom",
  contactPlaceholder: "Prénom et nom",
  conditionsLabel: "Conditions générales de votre offre",
  conditionsPlaceholder: "Validité de l'offre, délai de livraison, rabais, conditions de paiement…",
  attachmentLabel: "Pièce jointe (facultatif)",
  attachmentHint: "PDF, Excel ou image — 10 Mo maximum.",
  attachmentAdd: "Joindre un fichier",
  attachmentTooLarge: "Fichier trop volumineux (10 Mo maximum).",
  attachmentBadType: "Format non accepté. Utilisez PDF, Excel ou image.",
  attachmentFailed: "L'envoi du fichier a échoué. Vous pouvez transmettre votre offre sans pièce jointe.",
  totalLabel: "Total de votre offre",
  submit: "Transmettre mon offre",
  submitting: "Envoi en cours…",
  successTitle: "Offre transmise",
  successBody: "Merci. Votre offre a bien été enregistrée et transmise au chef de projet.",
  errorNoPrices: "Saisissez au moins un prix avant de transmettre votre offre.",
  errorInvalidPrice: "Un des prix saisis est invalide.",
  errorGeneric: "L'enregistrement a échoué. Réessayez dans un instant.",
  vatNote: "Tous les montants sont hors taxes, en francs suisses (CHF).",
  poweredBy: "Formulaire sécurisé — propulsé par Cantaia",
};

const DE: Strings = {
  loading: "Anfrage wird geladen…",
  notFoundTitle: "Ungültiger oder abgelaufener Link",
  notFoundBody:
    "Zu diesem Link existiert keine Preisanfrage. Bitte prüfen Sie die Adresse oder antworten Sie direkt auf die erhaltene E-Mail.",
  rateLimited: "Zu viele Versuche. Bitte versuchen Sie es in einigen Minuten erneut.",
  headerFor: "Preisanfrage",
  fromLabel: "Auftraggeber",
  supplierLabel: "Lieferant",
  closedTitle: "Diese Ausschreibung ist abgeschlossen",
  closedBodyAwarded:
    "Dieses Los wurde bereits vergeben. Eine Offerte kann nicht mehr übermittelt oder geändert werden.",
  closedBodyDeadline:
    "Die Antwortfrist ist abgelaufen. Eine Offerte kann nicht mehr übermittelt oder geändert werden.",
  project: "Projekt",
  group: "Los",
  reference: "Referenz",
  deadline: "Antwortfrist",
  intro:
    "Erfassen Sie Ihre Einheitspreise exkl. MwSt. für die untenstehenden Positionen. Lassen Sie das Feld leer, wenn Sie eine Position nicht offerieren.",
  alreadyTitle: "Offerte bereits übermittelt",
  alreadyBody: (d) => `Sie haben Ihre Offerte am ${d} übermittelt. Sie können sie unten korrigieren.`,
  edit: "Offerte anpassen",
  colNumber: "Nr.",
  colDescription: "Bezeichnung",
  colUnit: "Einheit",
  colQuantity: "Menge",
  colUnitPrice: "EP exkl. MwSt.",
  colTotal: "Total exkl. MwSt.",
  colRemarks: "Bemerkung",
  remarksPlaceholder: "Variante, Termin, Bedingung…",
  noPriceHint: "Nicht offeriert",
  contactLabel: "Ihr Name",
  contactPlaceholder: "Vor- und Nachname",
  conditionsLabel: "Allgemeine Bedingungen Ihrer Offerte",
  conditionsPlaceholder: "Gültigkeit, Lieferfrist, Rabatt, Zahlungsbedingungen…",
  attachmentLabel: "Anhang (optional)",
  attachmentHint: "PDF, Excel oder Bild — maximal 10 MB.",
  attachmentAdd: "Datei anhängen",
  attachmentTooLarge: "Datei zu gross (maximal 10 MB).",
  attachmentBadType: "Format nicht zulässig. Bitte PDF, Excel oder Bild verwenden.",
  attachmentFailed: "Der Datei-Upload ist fehlgeschlagen. Sie können die Offerte auch ohne Anhang übermitteln.",
  totalLabel: "Total Ihrer Offerte",
  submit: "Offerte übermitteln",
  submitting: "Wird übermittelt…",
  successTitle: "Offerte übermittelt",
  successBody: "Vielen Dank. Ihre Offerte wurde erfasst und an den Projektleiter übermittelt.",
  errorNoPrices: "Bitte erfassen Sie mindestens einen Preis, bevor Sie die Offerte übermitteln.",
  errorInvalidPrice: "Einer der erfassten Preise ist ungültig.",
  errorGeneric: "Die Speicherung ist fehlgeschlagen. Bitte versuchen Sie es gleich noch einmal.",
  vatNote: "Alle Beträge exklusive MwSt., in Schweizer Franken (CHF).",
  poweredBy: "Sicheres Formular — bereitgestellt von Cantaia",
};

const EN: Strings = {
  loading: "Loading the request…",
  notFoundTitle: "Invalid or expired link",
  notFoundBody:
    "This link does not match any price request. Check the address, or reply directly to the email you received.",
  rateLimited: "Too many attempts. Please try again in a few minutes.",
  headerFor: "Request for quotation",
  fromLabel: "From",
  supplierLabel: "Supplier",
  closedTitle: "This consultation is closed",
  closedBodyAwarded:
    "This lot has already been awarded. Quotations can no longer be submitted or edited.",
  closedBodyDeadline:
    "The response deadline has passed. Quotations can no longer be submitted or edited.",
  project: "Project",
  group: "Lot",
  reference: "Reference",
  deadline: "Response deadline",
  intro:
    "Enter your unit prices excluding VAT for the items below. Leave a field empty for an item you do not quote.",
  alreadyTitle: "Quotation already submitted",
  alreadyBody: (d) => `You submitted your quotation on ${d}. You may correct it below.`,
  edit: "Edit my quotation",
  colNumber: "No.",
  colDescription: "Description",
  colUnit: "Unit",
  colQuantity: "Quantity",
  colUnitPrice: "Unit price",
  colTotal: "Total",
  colRemarks: "Remark",
  remarksPlaceholder: "Variant, lead time, condition…",
  noPriceHint: "Not quoted",
  contactLabel: "Your name",
  contactPlaceholder: "First and last name",
  conditionsLabel: "General terms of your quotation",
  conditionsPlaceholder: "Validity, delivery time, discount, payment terms…",
  attachmentLabel: "Attachment (optional)",
  attachmentHint: "PDF, Excel or image — 10 MB maximum.",
  attachmentAdd: "Attach a file",
  attachmentTooLarge: "File too large (10 MB maximum).",
  attachmentBadType: "Unsupported format. Use PDF, Excel or an image.",
  attachmentFailed: "The file upload failed. You can still submit your quotation without an attachment.",
  totalLabel: "Quotation total",
  submit: "Submit my quotation",
  submitting: "Submitting…",
  successTitle: "Quotation submitted",
  successBody: "Thank you. Your quotation has been recorded and sent to the project manager.",
  errorNoPrices: "Enter at least one price before submitting your quotation.",
  errorInvalidPrice: "One of the prices entered is invalid.",
  errorGeneric: "Saving failed. Please try again in a moment.",
  vatNote: "All amounts exclude VAT, in Swiss francs (CHF).",
  poweredBy: "Secure form — powered by Cantaia",
};

const DICT: Record<Lang, Strings> = { fr: FR, de: DE, en: EN };
const LOCALE_TAG: Record<Lang, string> = { fr: "fr-CH", de: "de-CH", en: "en-CH" };

/* ═══════════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════════ */

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ["pdf", "xlsx", "xls", "csv", "png", "jpg", "jpeg", "webp"];

/** Accepts "1'250.50", "1 250,50", "1250.5" — Swiss suppliers type all three. */
function parsePrice(raw: string): number | null {
  const cleaned = raw.replace(/[’'\s ]/g, "").replace(",", ".");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function formatAmount(value: number | null, lang: Lang): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString(LOCALE_TAG[lang], {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(value: string | null, lang: Lang): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(LOCALE_TAG[lang], { day: "numeric", month: "long", year: "numeric" });
}

/* ═══════════════════════════════════════════════════════════════
   Page
   ═══════════════════════════════════════════════════════════════ */

export default function SupplierOfferPortalPage() {
  const params = useParams();
  const token = typeof params?.token === "string" ? params.token : "";
  // Before the payload arrives (loading / error states) the page has no stored
  // language yet — fall back to the URL locale instead of hardcoded French.
  const urlLang: Lang =
    typeof params?.locale === "string" && (["fr", "de", "en"] as const).includes(params.locale as Lang)
      ? (params.locale as Lang)
      : "fr";

  const [loading, setLoading] = useState(true);
  const [payload, setPayload] = useState<PortalPayload | null>(null);
  const [loadError, setLoadError] = useState<"not_found" | "rate_limited" | "generic" | null>(null);

  const [prices, setPrices] = useState<Record<string, string>>({});
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [conditions, setConditions] = useState("");
  const [contactName, setContactName] = useState("");

  const [attachment, setAttachment] = useState<{ storage_path: string; file_name: string } | null>(null);
  const [attachmentUploading, setAttachmentUploading] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  /** Set when the server answers 410 {error:"closed"} — the consultation is over. */
  const [closed, setClosed] = useState<"awarded" | "deadline" | null>(null);

  const lang: Lang = payload?.language ?? urlLang;
  const t = DICT[lang];

  // ── Load ────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) {
      setLoadError("not_found");
      setLoading(false);
      return;
    }
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`/api/supplier-portal/${token}`);
        if (cancelled) return;
        if (res.status === 429) {
          setLoadError("rate_limited");
          return;
        }
        if (!res.ok) {
          setLoadError("not_found");
          return;
        }
        const json: PortalPayload = await res.json();
        if (cancelled) return;

        setPayload(json);
        const initialPrices: Record<string, string> = {};
        const initialRemarks: Record<string, string> = {};
        for (const item of json.items || []) {
          if (item.previous_unit_price_ht != null) {
            initialPrices[item.id] = String(item.previous_unit_price_ht);
          }
          if (item.previous_remarks) initialRemarks[item.id] = item.previous_remarks;
        }
        setPrices(initialPrices);
        setRemarks(initialRemarks);
        setConditions(json.conditions_text || "");
        setContactName(json.contact_name || "");
      } catch {
        if (!cancelled) setLoadError("generic");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  // ── Running total ───────────────────────────────────────────
  const total = useMemo(() => {
    if (!payload) return null;
    let sum = 0;
    let any = false;
    for (const item of payload.items) {
      const price = parsePrice(prices[item.id] ?? "");
      if (price == null) continue;
      any = true;
      sum += item.quantity != null ? price * item.quantity : price;
    }
    return any ? sum : null;
  }, [payload, prices]);

  // ── Attachment ──────────────────────────────────────────────
  const handleFile = useCallback(
    async (file: File) => {
      setAttachmentError(null);

      const ext = file.name.split(".").pop()?.toLowerCase() || "";
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        setAttachmentError(t.attachmentBadType);
        return;
      }
      if (file.size > MAX_ATTACHMENT_BYTES) {
        setAttachmentError(t.attachmentTooLarge);
        return;
      }

      setAttachmentUploading(true);
      try {
        const res = await fetch(`/api/supplier-portal/${token}/upload`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: file.name, size: file.size, content_type: file.type }),
        });
        const json = await res.json();
        if (!res.ok || !json.signed_url) throw new Error(json.error || "upload_url_failed");

        // The binary goes straight to Supabase Storage, never through Vercel.
        const put = await fetch(json.signed_url, {
          method: "PUT",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        });
        if (!put.ok) throw new Error("storage_put_failed");

        setAttachment({ storage_path: json.storage_path, file_name: json.file_name || file.name });
      } catch {
        setAttachmentError(t.attachmentFailed);
      } finally {
        setAttachmentUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [token, t]
  );

  // ── Submit ──────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (!payload) return;
    setSubmitError(null);

    const lines: Array<{ item_id: string; unit_price_ht: number | null; remarks?: string | null }> = [];
    let hasPrice = false;

    for (const item of payload.items) {
      const raw = (prices[item.id] ?? "").trim();
      const remark = (remarks[item.id] ?? "").trim();
      if (!raw && !remark) continue;

      let price: number | null = null;
      if (raw) {
        price = parsePrice(raw);
        if (price == null) {
          setSubmitError(t.errorInvalidPrice);
          return;
        }
        hasPrice = true;
      }
      lines.push({ item_id: item.id, unit_price_ht: price, remarks: remark || null });
    }

    if (!hasPrice) {
      setSubmitError(t.errorNoPrices);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/supplier-portal/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lines,
          conditions_text: conditions.trim() || null,
          contact_name: contactName.trim() || null,
          attachment: attachment
            ? { file_url: attachment.storage_path, file_name: attachment.file_name }
            : null,
        }),
      });
      const json = await res.json().catch(() => ({}));

      // 410: the consultation was closed (lot awarded, or deadline passed)
      // between the email and the submit — show the dedicated screen.
      if (res.status === 410 || json?.error === "closed") {
        setClosed(json?.reason === "awarded" ? "awarded" : "deadline");
        return;
      }
      if (res.status === 429) {
        setSubmitError(t.rateLimited);
        return;
      }
      if (!res.ok || !json.success) {
        setSubmitError(
          json?.error === "no_prices"
            ? t.errorNoPrices
            : json?.error === "invalid_price"
              ? t.errorInvalidPrice
              : t.errorGeneric
        );
        return;
      }
      setSubmitted(true);
    } catch {
      setSubmitError(t.errorGeneric);
    } finally {
      setSubmitting(false);
    }
  }, [payload, prices, remarks, conditions, contactName, attachment, token, t]);

  /* ── Render ─────────────────────────────────────────────── */

  if (loading) {
    return (
      <Shell>
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-[#F97316]" />
          <p className="text-sm text-[#A1A1AA]">{t.loading}</p>
        </div>
      </Shell>
    );
  }

  if (loadError || !payload) {
    return (
      <Shell>
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-center px-6">
          <AlertCircle className="h-10 w-10 text-red-400" />
          <h1 className="text-lg font-semibold text-[#FAFAFA]">{t.notFoundTitle}</h1>
          <p className="text-sm text-[#A1A1AA] max-w-md">
            {loadError === "rate_limited" ? t.rateLimited : t.notFoundBody}
          </p>
        </div>
      </Shell>
    );
  }

  if (closed) {
    return (
      <Shell>
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-center px-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/10">
            <AlertCircle className="h-8 w-8 text-amber-400" />
          </div>
          <h1 className="text-lg font-semibold text-[#FAFAFA]">{t.closedTitle}</h1>
          <p className="text-sm text-[#A1A1AA] max-w-md">
            {closed === "awarded" ? t.closedBodyAwarded : t.closedBodyDeadline}
          </p>
          {payload?.tracking_code && (
            <p className="text-xs text-[#A1A1AA] font-mono mt-2">{payload.tracking_code}</p>
          )}
        </div>
      </Shell>
    );
  }

  if (submitted) {
    return (
      <Shell>
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-center px-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10">
            <CheckCircle2 className="h-8 w-8 text-emerald-400" />
          </div>
          <h1 className="text-lg font-semibold text-[#FAFAFA]">{t.successTitle}</h1>
          <p className="text-sm text-[#A1A1AA] max-w-md">{t.successBody}</p>
          {payload.tracking_code && (
            <p className="text-xs text-[#A1A1AA] font-mono mt-2">{payload.tracking_code}</p>
          )}
        </div>
      </Shell>
    );
  }

  const deadlineStr = formatDate(payload.deadline, lang);
  const submittedStr = formatDate(payload.submitted_at, lang);

  return (
    <Shell>
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        {/* Header */}
        <header className="mb-6">
          <p className="text-xs uppercase tracking-wide text-[#F97316] font-semibold">
            {t.headerFor}
          </p>
          <h1 className="mt-1 text-xl sm:text-2xl font-semibold text-[#FAFAFA]">
            {payload.project.name || "—"}
            {payload.material_group ? (
              <span className="text-[#A1A1AA] font-normal"> · {payload.material_group}</span>
            ) : null}
          </h1>
          <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1.5 text-xs text-[#A1A1AA]">
            {/* organization_name is the ORG sending the request, supplier_name is
                the recipient — they were labelled "Projet"/"Lot" (inverted). */}
            {payload.organization_name && (
              <div>
                <dt className="inline text-[#A1A1AA]">{t.fromLabel}: </dt>
                <dd className="inline text-[#FAFAFA]">{payload.organization_name}</dd>
              </div>
            )}
            {payload.supplier_name && (
              <div>
                <dt className="inline text-[#A1A1AA]">{t.supplierLabel}: </dt>
                <dd className="inline text-[#FAFAFA]">{payload.supplier_name}</dd>
              </div>
            )}
            {payload.tracking_code && (
              <div>
                <dt className="inline text-[#A1A1AA]">{t.reference}: </dt>
                <dd className="inline font-mono text-[#FAFAFA]">{payload.tracking_code}</dd>
              </div>
            )}
            {deadlineStr && (
              <div>
                <dt className="inline text-[#A1A1AA]">{t.deadline}: </dt>
                <dd className="inline text-[#FAFAFA]">{deadlineStr}</dd>
              </div>
            )}
          </dl>
        </header>

        {payload.already_submitted && submittedStr && (
          <div className="mb-5 flex items-start gap-2.5 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-emerald-400">{t.alreadyTitle}</p>
              <p className="text-xs text-[#A1A1AA] mt-0.5">{t.alreadyBody(submittedStr)}</p>
            </div>
          </div>
        )}

        <p className="mb-5 text-sm text-[#A1A1AA]">{t.intro}</p>

        {/* Items */}
        <div className="overflow-hidden rounded-xl border border-[#27272A] bg-[#18181B]">
          {/* ── Mobile (<640px): one card per item. This form is filled on site,
                 on a phone — a 720px-wide table forced horizontal scrolling on
                 the single most important screen of the module. ── */}
          <div className="sm:hidden divide-y divide-[#27272A]">
            {payload.items.map((item) => {
              const raw = prices[item.id] ?? "";
              const price = parsePrice(raw);
              const invalid = raw.trim().length > 0 && price == null;
              const lineTotal =
                price != null && item.quantity != null ? price * item.quantity : null;

              return (
                <div key={item.id} className="p-4 space-y-3">
                  {/* N° + description */}
                  <div className="flex items-start gap-2">
                    {item.item_number && (
                      <span className="mt-0.5 shrink-0 font-mono text-xs text-[#A1A1AA]">
                        {item.item_number}
                      </span>
                    )}
                    <p className="text-sm leading-snug text-[#FAFAFA]">
                      {item.description || "—"}
                    </p>
                  </div>
                  {/* Unit / quantity stacked meta */}
                  {(item.unit || item.quantity != null) && (
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#A1A1AA]">
                      {item.quantity != null && (
                        <span>
                          {t.colQuantity}:{" "}
                          <span className="text-[#FAFAFA]">
                            {item.quantity.toLocaleString(LOCALE_TAG[lang])}
                          </span>
                        </span>
                      )}
                      {item.unit && (
                        <span>
                          {t.colUnit}: <span className="text-[#FAFAFA]">{item.unit}</span>
                        </span>
                      )}
                    </div>
                  )}
                  {/* Price — full width, text-base so iOS does not zoom on focus */}
                  <div>
                    <label
                      htmlFor={`portal-price-${item.id}`}
                      className="mb-1 block text-xs font-medium text-[#A1A1AA]"
                    >
                      {t.colUnitPrice}
                    </label>
                    <input
                      id={`portal-price-${item.id}`}
                      type="text"
                      inputMode="decimal"
                      value={raw}
                      onChange={(e) =>
                        setPrices((prev) => ({ ...prev, [item.id]: e.target.value }))
                      }
                      placeholder="0.00"
                      className={`w-full rounded-md border bg-[#0F0F11] px-3 py-2.5 text-right text-base text-[#FAFAFA] placeholder-[#A1A1AA] focus:outline-none focus:ring-1 ${
                        invalid
                          ? "border-red-500/60 focus:border-red-500 focus:ring-red-500/40"
                          : "border-[#27272A] focus:border-[#F97316]/60 focus:ring-[#F97316]/30"
                      }`}
                    />
                  </div>
                  {/* Line total */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[#A1A1AA]">{t.colTotal}</span>
                    {lineTotal != null ? (
                      <span className="text-sm font-medium text-[#FAFAFA]">
                        {formatAmount(lineTotal, lang)}
                      </span>
                    ) : (
                      <span className="text-xs text-[#A1A1AA]">{t.noPriceHint}</span>
                    )}
                  </div>
                  {/* Remark — full width */}
                  <input
                    type="text"
                    value={remarks[item.id] ?? ""}
                    aria-label={`${t.colRemarks} — ${item.description || item.item_number || ""}`}
                    onChange={(e) =>
                      setRemarks((prev) => ({ ...prev, [item.id]: e.target.value }))
                    }
                    placeholder={t.remarksPlaceholder}
                    maxLength={2000}
                    className="w-full rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-sm text-[#FAFAFA] placeholder-[#A1A1AA] focus:border-[#F97316]/60 focus:outline-none focus:ring-1 focus:ring-[#F97316]/30"
                  />
                </div>
              );
            })}
          </div>

          {/* ── ≥640px: the classic comparison table ── */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead>
                <tr className="border-b border-[#27272A] bg-[#1C1C1F] text-[11px] uppercase text-[#A1A1AA]">
                  <th className="px-3 py-2.5 text-left font-medium w-16">{t.colNumber}</th>
                  <th className="px-3 py-2.5 text-left font-medium">{t.colDescription}</th>
                  <th className="px-2 py-2.5 text-center font-medium w-16">{t.colUnit}</th>
                  <th className="px-2 py-2.5 text-right font-medium w-20">{t.colQuantity}</th>
                  <th className="px-3 py-2.5 text-right font-medium w-32">{t.colUnitPrice}</th>
                  <th className="px-3 py-2.5 text-right font-medium w-28">{t.colTotal}</th>
                  <th className="px-3 py-2.5 text-left font-medium w-48">{t.colRemarks}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#27272A]">
                {payload.items.map((item) => {
                  const raw = prices[item.id] ?? "";
                  const price = parsePrice(raw);
                  const invalid = raw.trim().length > 0 && price == null;
                  const lineTotal =
                    price != null && item.quantity != null ? price * item.quantity : null;

                  return (
                    <tr key={item.id} className="align-top hover:bg-[#1C1C1F]/60">
                      <td className="px-3 py-2.5 font-mono text-xs text-[#A1A1AA]">
                        {item.item_number || "—"}
                      </td>
                      <td className="px-3 py-2.5 text-sm text-[#FAFAFA]">{item.description || "—"}</td>
                      <td className="px-2 py-2.5 text-center text-xs text-[#A1A1AA]">
                        {item.unit || "—"}
                      </td>
                      <td className="px-2 py-2.5 text-right text-xs text-[#A1A1AA]">
                        {item.quantity != null
                          ? item.quantity.toLocaleString(LOCALE_TAG[lang])
                          : "—"}
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={raw}
                          aria-label={`${t.colUnitPrice} — ${item.description || item.item_number || ""}`}
                          onChange={(e) =>
                            setPrices((prev) => ({ ...prev, [item.id]: e.target.value }))
                          }
                          placeholder="0.00"
                          className={`w-full rounded-md border bg-[#0F0F11] px-2.5 py-1.5 text-right text-sm text-[#FAFAFA] placeholder-[#A1A1AA] focus:outline-none focus:ring-1 ${
                            invalid
                              ? "border-red-500/60 focus:border-red-500 focus:ring-red-500/40"
                              : "border-[#27272A] focus:border-[#F97316]/60 focus:ring-[#F97316]/30"
                          }`}
                        />
                      </td>
                      <td className="px-3 py-2.5 text-right text-sm text-[#FAFAFA]">
                        {lineTotal != null ? (
                          formatAmount(lineTotal, lang)
                        ) : (
                          <span className="text-xs text-[#A1A1AA]">{t.noPriceHint}</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={remarks[item.id] ?? ""}
                          aria-label={`${t.colRemarks} — ${item.description || item.item_number || ""}`}
                          onChange={(e) =>
                            setRemarks((prev) => ({ ...prev, [item.id]: e.target.value }))
                          }
                          placeholder={t.remarksPlaceholder}
                          maxLength={2000}
                          className="w-full rounded-md border border-[#27272A] bg-[#0F0F11] px-2.5 py-1.5 text-sm text-[#FAFAFA] placeholder-[#A1A1AA] focus:border-[#F97316]/60 focus:outline-none focus:ring-1 focus:ring-[#F97316]/30"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Total */}
          <div className="flex flex-col gap-2 border-t border-[#27272A] bg-[#1C1C1F] px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <span className="text-xs text-[#A1A1AA]">{t.vatNote}</span>
            <span className="text-sm text-[#A1A1AA]">
              {t.totalLabel}{" "}
              <strong className="ml-2 text-base text-[#FAFAFA]">
                {formatAmount(total, lang)} {payload.currency}
              </strong>
            </span>
          </div>
        </div>

        {/* Conditions + contact */}
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="portal-contact"
              className="mb-1.5 block text-xs font-medium text-[#A1A1AA]"
            >
              {t.contactLabel}
            </label>
            <input
              id="portal-contact"
              type="text"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder={t.contactPlaceholder}
              maxLength={200}
              className="w-full rounded-lg border border-[#27272A] bg-[#18181B] px-3 py-2 text-sm text-[#FAFAFA] placeholder-[#A1A1AA] focus:border-[#F97316]/60 focus:outline-none focus:ring-1 focus:ring-[#F97316]/30"
            />
          </div>

          <div>
            <span className="mb-1.5 block text-xs font-medium text-[#A1A1AA]">
              {t.attachmentLabel}
            </span>
            {attachment ? (
              <div className="flex items-center gap-2 rounded-lg border border-[#27272A] bg-[#18181B] px-3 py-2">
                <Paperclip className="h-3.5 w-3.5 shrink-0 text-[#F97316]" />
                <span className="min-w-0 flex-1 truncate text-sm text-[#FAFAFA]">
                  {attachment.file_name}
                </span>
                <button
                  type="button"
                  onClick={() => setAttachment(null)}
                  className="text-[#A1A1AA] transition-colors hover:text-[#FAFAFA]"
                  aria-label={t.attachmentLabel}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={attachmentUploading}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[#3F3F46] bg-[#18181B] px-3 py-2 text-sm text-[#A1A1AA] transition-colors hover:border-[#F97316]/50 hover:text-[#FAFAFA] disabled:opacity-50"
              >
                {attachmentUploading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Paperclip className="h-3.5 w-3.5" />
                )}
                {t.attachmentAdd}
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.xlsx,.xls,.csv,.png,.jpg,.jpeg,.webp"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />
            <p className="mt-1 text-[11px] text-[#A1A1AA]">{t.attachmentHint}</p>
            {attachmentError && (
              <p className="mt-1 text-[11px] text-red-400">{attachmentError}</p>
            )}
          </div>
        </div>

        <div className="mt-4">
          <label
            htmlFor="portal-conditions"
            className="mb-1.5 block text-xs font-medium text-[#A1A1AA]"
          >
            {t.conditionsLabel}
          </label>
          <textarea
            id="portal-conditions"
            value={conditions}
            onChange={(e) => setConditions(e.target.value)}
            placeholder={t.conditionsPlaceholder}
            rows={3}
            maxLength={5000}
            className="w-full resize-y rounded-lg border border-[#27272A] bg-[#18181B] px-3 py-2 text-sm text-[#FAFAFA] placeholder-[#A1A1AA] focus:border-[#F97316]/60 focus:outline-none focus:ring-1 focus:ring-[#F97316]/30"
          />
        </div>

        {submitError && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {submitError}
          </div>
        )}

        {/* Submit */}
        <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#F97316] px-6 py-2.5 text-sm font-semibold text-[#0F0F11] transition-colors hover:bg-[#EA580C] disabled:opacity-50 sm:w-auto"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            {submitting ? t.submitting : t.submit}
          </button>
        </div>

        <p className="mt-10 text-center text-[11px] text-[#A1A1AA]">{t.poweredBy}</p>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-[#0F0F11] text-[#FAFAFA]">{children}</div>;
}
