// ============================================================
// Cantaia — Plan Detector Service
// Detects construction plans in email attachments using AI
// ============================================================

export interface Attachment {
  id: string;
  name: string;
  contentType: string;
  size: number;
}

export interface PlanDetectionContext {
  sender_email: string;
  sender_name: string;
  subject: string;
  body_excerpt: string;
  filename: string;
  filesize: number;
  filetype: string;
  project_name: string;
  project_code: string;
  lots_list: string;
  existing_plans_summary: string;
}

export interface PlanDetectionResult {
  is_plan: boolean;
  confidence: number;
  plan_number?: string;
  plan_title?: string;
  version_code?: string;
  discipline?: string;
  cfc_code?: string;
  lot_name?: string;
  zone?: string;
  scale?: string;
  author_company?: string;
  is_new_version?: boolean;
  existing_plan_id?: string;
  changes_description?: string;
  requires_approval?: boolean;
  reason?: string;
}

// File extensions considered as potential plans
const PLAN_EXTENSIONS = [".pdf", ".dwg", ".dxf", ".png", ".jpg", ".jpeg"];
const MIN_PLAN_SIZE = 500 * 1024; // 500KB minimum for a plan

// Filename patterns that suggest a plan
const PLAN_FILENAME_PATTERNS = [
  /\d{3}[-_][A-Z0-9]+[-_]\d{2}/i, // 211-B2-04
  /[A-Z]{2,4}[-_]\d{2,4}/i, // ARC-301, EL-201, CVC-401
  /plan/i,
  /coupe/i,
  /facade/i,
  /schema/i,
  /detail/i,
  /coffrage/i,
  /armature/i,
  /implantation/i,
  /[Vv][-_.]?[A-D]/,  // V-A, V.B, V-C
  /[Rr]ev[-_.]?[A-D]/i, // RevA, Rev.B
  /[Ii]nd[-_.]?[A-D]/i, // Ind.A, IndB
];

// Keywords in email that suggest plan content
const PLAN_EMAIL_KEYWORDS = [
  "plan", "plans", "mise à jour", "révision", "version", "indice",
  "ci-joint les plans", "plans modifiés", "nouvelle version", "plans corrigés",
  "plans pour exécution", "plans pour approbation", "BAE", "BPE",
  "plans révisés", "plans mis à jour", "dessin", "dessins",
  "drawing", "zeichnung", "plankopf",
];

// Non-plan indicators
const NON_PLAN_PATTERNS = [
  /facture/i, /offre/i, /soumission/i, /courrier/i,
  /pv[-_\s]/i, /devis/i, /contrat/i, /rapport/i,
  /photo/i, /image/i, /logo/i, /signature/i,
];

/**
 * Quick pre-filter: check if an attachment is likely a plan based on filename and size
 */
export function isPotentialPlan(attachment: Attachment): boolean {
  const ext = "." + attachment.name.split(".").pop()?.toLowerCase();
  if (!PLAN_EXTENSIONS.includes(ext)) return false;
  if (attachment.size < MIN_PLAN_SIZE) return false;

  // Check for non-plan patterns
  if (NON_PLAN_PATTERNS.some((p) => p.test(attachment.name))) return false;

  return true;
}

/**
 * Check if the email subject/body suggests plan content
 */
export function emailSuggestsPlans(subject: string, body: string): boolean {
  const text = `${subject} ${body}`.toLowerCase();
  return PLAN_EMAIL_KEYWORDS.some((kw) => text.includes(kw.toLowerCase()));
}

/**
 * Build the Claude prompt for plan detection
 */
export function buildPlanDetectPrompt(ctx: PlanDetectionContext): string {
  return `Tu es un expert en gestion de plans de construction en Suisse.

Analyse cette pièce jointe d'email et détermine s'il s'agit d'un plan de construction.

Email :
- Expéditeur : ${ctx.sender_name} <${ctx.sender_email}>
- Objet : ${ctx.subject}
- Corps (extrait) : ${ctx.body_excerpt}

Pièce jointe :
- Nom du fichier : ${ctx.filename}
- Taille : ${Math.round(ctx.filesize / 1024)} KB
- Type : ${ctx.filetype}

Projet : ${ctx.project_name} (${ctx.project_code})
Lots du projet : ${ctx.lots_list}
Plans existants dans le registre : ${ctx.existing_plans_summary}

SI c'est un plan, extrais les informations suivantes en JSON :
{
  "is_plan": true,
  "confidence": 0.95,
  "plan_number": "211-B2-04",
  "plan_title": "Coffrage dalle sous-sol B2",
  "version_code": "C",
  "discipline": "structure",
  "cfc_code": "CFC 211",
  "lot_name": "Gros-œuvre",
  "zone": "Sous-sol B2",
  "scale": "1:50",
  "author_company": "BG Ingénieurs",
  "is_new_version": true,
  "existing_plan_id": "uuid-du-plan-existant-si-trouvé",
  "changes_description": "Zone parking est modifiée, armature renforcée",
  "requires_approval": true
}

SI ce n'est PAS un plan (facture, courrier, photo, document administratif) :
{
  "is_plan": false,
  "confidence": 0.90,
  "reason": "Document administratif (facture)"
}

INDICES que c'est un plan :
- Nom de fichier contient un numéro structuré (211-B2-04, ARC-301, EL-201)
- Nom contient "plan", "coupe", "facade", "schema", "detail"
- Nom contient une version (V-A, RevB, v3, Ind.C)
- L'email parle de "plans", "mise à jour", "révision", "pour exécution"
- Le fichier est un PDF > 1MB ou un DWG/DXF
- L'expéditeur est un architecte, ingénieur, ou bureau d'études

INDICES que ce n'est PAS un plan :
- C'est une facture, un devis, un PV, un courrier
- Le fichier fait < 200KB (trop petit pour un plan)
- Le nom contient "facture", "offre", "soumission", "courrier", "PV"

Réponds UNIQUEMENT en JSON valide, sans commentaires.`;
}

/**
 * Detect plans in email attachments (mock implementation)
 * In production, calls Claude API for analysis
 */
export async function detectPlansInEmail(
  _emailId: string,
  attachments: Attachment[],
  context: {
    sender_email: string;
    sender_name: string;
    subject: string;
    body_excerpt: string;
    project_name: string;
    project_code: string;
    lots_list: string;
    existing_plans_summary: string;
  }
): Promise<PlanDetectionResult[]> {
  const results: PlanDetectionResult[] = [];
  const potentialPlans = attachments.filter(isPotentialPlan);

  if (potentialPlans.length === 0 && !emailSuggestsPlans(context.subject, context.body_excerpt)) {
    return results;
  }

  for (const attachment of potentialPlans) {
    try {
      // In production: call Claude API with buildPlanDetectPrompt()
      // const Anthropic = (await import("@anthropic-ai/sdk")).default;
      // const client = new Anthropic();
      // const response = await client.messages.create({ ... });

      // Mock: detect based on filename patterns
      const result = mockDetectPlan(attachment, context);
      if (result) {
        results.push(result);
      }
    } catch (error) {
      console.error(`[PlanDetector] Error analyzing ${attachment.name}:`, error);
    }
  }

  return results;
}

/**
 * Mock detection based on filename analysis
 */
function mockDetectPlan(
  attachment: Attachment,
  context: { subject: string; body_excerpt: string }
): PlanDetectionResult | null {
  const name = attachment.name;

  // Check if filename matches plan patterns
  const matchesPattern = PLAN_FILENAME_PATTERNS.some((p) => p.test(name));
  if (!matchesPattern && !emailSuggestsPlans(context.subject, context.body_excerpt)) {
    return { is_plan: false, confidence: 0.85, reason: "No plan pattern detected in filename" };
  }

  // Extract plan number from filename
  const numberMatch = name.match(/(\d{3}[-_][A-Z0-9]+[-_]\d{2})/i) || name.match(/([A-Z]{2,4}[-_]\d{2,4})/i);
  const planNumber = numberMatch ? numberMatch[1].replace(/_/g, "-") : null;

  // Extract version from filename
  const versionMatch = name.match(/[Vv][-_.]?([A-D])/i) || name.match(/[Rr]ev[-_.]?([A-D])/i) || name.match(/[Ii]nd[-_.]?([A-D])/i);
  const versionCode = versionMatch ? versionMatch[1].toUpperCase() : "A";

  if (!planNumber) {
    return { is_plan: false, confidence: 0.6, reason: "Could not extract plan number from filename" };
  }

  return {
    is_plan: true,
    confidence: 0.88,
    plan_number: planNumber,
    plan_title: name.replace(/[-_]/g, " ").replace(/\.[^.]+$/, "").replace(/\s+[Vv][-_.]?[A-D]$/, ""),
    version_code: versionCode,
    discipline: guessDiscipline(name, planNumber),
    author_company: null as unknown as string | undefined,
    is_new_version: versionCode !== "A",
    requires_approval: false,
  };
}

function guessDiscipline(filename: string, planNumber: string): string {
  const lower = filename.toLowerCase() + " " + planNumber.toLowerCase();
  if (/arc|facade|interior|intérieur/i.test(lower)) return "architecture";
  if (/211|coffrage|armature|fondation|mur|struct/i.test(lower)) return "structure";
  if (/cvc|ventil|chauff|clim/i.test(lower)) return "cvcs";
  if (/el[-_]|electr|unifil|cable/i.test(lower)) return "electricite";
  if (/san[-_]|sanit|colon/i.test(lower)) return "sanitaire";
  if (/fac[-_]|façade/i.test(lower)) return "facades";
  return "architecture";
}
