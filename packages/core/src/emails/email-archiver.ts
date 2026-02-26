// ============================================================
// Email Archiver — Archive emails to local filesystem
// Supports multiple folder structures (by_category, by_date, by_sender, flat)
// Works natively in Tauri desktop; provides ZIP download in web.
// ============================================================

import type { ArchiveStructure, ArchiveFilenameFormat } from "@cantaia/database";

export interface ArchiveEmailInput {
  emailId: string;
  projectName: string;
  senderEmail: string;
  senderName: string | null;
  subject: string;
  receivedAt: string;
  classification: string | null;
  attachmentNames: string[];
}

export interface ArchivePathResult {
  folder: string;
  fileName: string;
  attachmentsFolder: string | null;
}

// ── Folder structure: by_category ──

const CATEGORY_FOLDERS = {
  correspondence: "01_Correspondance",
  architect: "01_Correspondance/01_Architecte",
  engineers: "01_Correspondance/02_Ingenieurs",
  contractors: "01_Correspondance/03_Entreprises",
  client: "01_Correspondance/04_Maitre-ouvrage",
  misc_correspondence: "01_Correspondance/05_Divers",
  meetings: "02_PV-Seances",
  plans: "03_Plans",
  submissions: "04_Soumissions-Offres",
  amendments: "05_Avenants",
  invoices: "06_Situations-Factures",
  photos: "07_Photos",
  misc: "08_Divers",
} as const;

/**
 * Get the full default folder structure for "by_category" mode.
 * Used when creating the initial folder tree.
 */
export function getDefaultFolderTree(): string[] {
  return [
    "01_Correspondance",
    "01_Correspondance/01_Architecte",
    "01_Correspondance/02_Ingenieurs",
    "01_Correspondance/03_Entreprises",
    "01_Correspondance/04_Maitre-ouvrage",
    "01_Correspondance/05_Divers",
    "02_PV-Seances",
    "03_Plans",
    "04_Soumissions-Offres",
    "05_Avenants",
    "06_Situations-Factures",
    "07_Photos",
    "08_Divers",
  ];
}

/**
 * Determine where to archive an email based on its content.
 * This is a heuristic fallback — the AI-based version uses Claude for better accuracy.
 */
export function determineArchivePath(
  email: ArchiveEmailInput,
  structure: ArchiveStructure,
  filenameFormat: ArchiveFilenameFormat
): ArchivePathResult {
  const date = new Date(email.receivedAt);
  const dateStr = formatArchiveDate(date);
  const senderShort = extractCompanyName(email.senderEmail, email.senderName);
  const subjectClean = sanitizeFilename(email.subject).substring(0, 80);

  // Determine filename
  let fileName: string;
  switch (filenameFormat) {
    case "date_sender_subject":
      fileName = `${dateStr}_${senderShort}_${subjectClean}`;
      break;
    case "date_subject":
      fileName = `${dateStr}_${subjectClean}`;
      break;
    case "original":
      fileName = sanitizeFilename(email.subject);
      break;
    default:
      fileName = `${dateStr}_${senderShort}_${subjectClean}`;
  }

  // Determine folder based on structure
  let folder: string;
  let attachmentsFolder: string | null = null;

  switch (structure) {
    case "by_category":
      folder = determineCategoryFolder(email, senderShort);
      break;
    case "by_date": {
      const yearMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      folder = yearMonth;
      break;
    }
    case "by_sender":
      folder = senderShort || "Divers";
      break;
    case "flat":
    default:
      folder = "";
      break;
  }

  // Attachments folder — for certain attachment types, use thematic folder
  if (email.attachmentNames.length > 0) {
    const hasPlans = email.attachmentNames.some(
      (n) => /\.(dwg|dxf|pdf)$/i.test(n) && /plan|facade|coupe|section/i.test(n)
    );
    const hasPhotos = email.attachmentNames.some(
      (n) => /\.(jpg|jpeg|png|heic|heif)$/i.test(n)
    );
    const hasInvoices = email.attachmentNames.some(
      (n) => /facture|invoice|situation|decompte/i.test(n)
    );

    if (hasPlans && structure === "by_category") {
      attachmentsFolder = CATEGORY_FOLDERS.plans;
    } else if (hasPhotos && structure === "by_category") {
      attachmentsFolder = CATEGORY_FOLDERS.photos;
    } else if (hasInvoices && structure === "by_category") {
      attachmentsFolder = CATEGORY_FOLDERS.invoices;
    }
  }

  return { folder, fileName, attachmentsFolder };
}

/**
 * Build the prompt for Claude to determine the archive folder.
 * Used for AI-based folder determination (more accurate than heuristics).
 */
export function buildArchiveFolderPrompt(
  projectName: string,
  email: ArchiveEmailInput,
  folderStructure: string[]
): string {
  return `Tu es un expert en classement de documents de construction suisse.

Email classé dans le projet "${projectName}" :
- De : ${email.senderName || email.senderEmail}
- Objet : ${email.subject}
- Date : ${email.receivedAt}
- Pièces jointes : ${email.attachmentNames.join(", ") || "aucune"}

Arborescence du projet :
${folderStructure.map((f) => `  ${f}/`).join("\n")}

Dans quel dossier cet email doit-il être archivé ?
Retourne UNIQUEMENT en JSON :
{
  "folder": "01_Correspondance/03_Entreprises/NomEntreprise",
  "file_name": "${formatArchiveDate(new Date(email.receivedAt))}_${extractCompanyName(email.senderEmail, email.senderName)}_${sanitizeFilename(email.subject).substring(0, 50)}",
  "reasoning": "Explication courte",
  "attachments_folder": "03_Plans"
}

Si les pièces jointes doivent aller dans un dossier DIFFÉRENT de l'email (ex: email dans Correspondance mais PJ est un plan → plan dans 03_Plans), indique-le dans attachments_folder. Sinon, mets null.`;
}

// ── Helpers ──

function determineCategoryFolder(email: ArchiveEmailInput, senderCompany: string): string {
  const subject = email.subject.toLowerCase();
  const sender = email.senderEmail.toLowerCase();

  // PV / meeting
  if (/\b(pv|proc[eè]s.?verbal|s[eé]ance|r[eé]union)\b/i.test(subject)) {
    return CATEGORY_FOLDERS.meetings;
  }
  // Plans
  if (/\b(plan|fa[cç]ade|coupe|d[eé]tail|vue|section)\b/i.test(subject)) {
    return CATEGORY_FOLDERS.plans;
  }
  // Submissions / offers
  if (/\b(soumission|offre|devis|appel.?d.?offre|adjudication)\b/i.test(subject)) {
    return CATEGORY_FOLDERS.submissions;
  }
  // Invoices
  if (/\b(facture|situation|d[eé]compte|acompte)\b/i.test(subject)) {
    return CATEGORY_FOLDERS.invoices;
  }
  // Amendments
  if (/\b(avenant|modification|suppl[eé]ment)\b/i.test(subject)) {
    return CATEGORY_FOLDERS.amendments;
  }

  // By sender role
  if (/architect/i.test(sender) || /architect/i.test(senderCompany)) {
    return CATEGORY_FOLDERS.architect;
  }
  if (/ing[eé]nieur|engineer/i.test(sender) || /ing[eé]nieur/i.test(senderCompany)) {
    return CATEGORY_FOLDERS.engineers;
  }

  // Default: general correspondence
  return `${CATEGORY_FOLDERS.contractors}/${senderCompany || "Divers"}`;
}

function formatArchiveDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function extractCompanyName(email: string, name: string | null): string {
  // Try to extract company from sender name first
  if (name) {
    // "Pierre Favre (BG Ingénieurs)" → "BG-Ingenieurs"
    const parenMatch = name.match(/\(([^)]+)\)/);
    if (parenMatch) return sanitizeFilename(parenMatch[1]);
  }

  // Extract domain and clean it
  const domain = email.split("@")[1] || "";
  const parts = domain.split(".");
  if (parts.length >= 2) {
    // "pierre@bg-ingenieurs.ch" → "bg-ingenieurs"
    return sanitizeFilename(parts[parts.length - 2]);
  }
  return sanitizeFilename(domain);
}

function sanitizeFilename(str: string): string {
  return str
    .replace(/[<>:"/\\|?*]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[àâä]/g, "a")
    .replace(/[éèêë]/g, "e")
    .replace(/[ïî]/g, "i")
    .replace(/[ôö]/g, "o")
    .replace(/[ùûü]/g, "u")
    .replace(/[ç]/g, "c")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 200);
}
