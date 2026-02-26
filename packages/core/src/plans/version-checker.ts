// ============================================================
// Cantaia — Plan Version Checker
// Detects references to outdated plan versions in emails
// Implemented in Step 12.5
// ============================================================

export interface PlanReference {
  plan_number: string;
  version_referenced: string | null;
  context: string;
  is_outdated: boolean;
  current_version: string;
  severity: "critical" | "warning";
  risk_description: string;
}

export interface PlanReferenceCheckResult {
  references_found: PlanReference[];
}

export interface ExistingPlan {
  id: string;
  plan_number: string;
  plan_title: string;
  current_version: string;
  version_date: string;
}

/**
 * Build Claude prompt for checking plan references in emails
 */
export function buildPlanReferenceCheckPrompt(
  subject: string,
  body: string,
  attachments_names: string[],
  plans_list: ExistingPlan[]
): string {
  return `Analyse cet email et identifie toute référence à des plans de construction.

Email :
- Objet : ${subject}
- Corps : ${body}
- Pièces jointes : ${attachments_names.join(", ")}

Plans existants sur ce projet :
${plans_list.map((p) => `${p.plan_number} "${p.plan_title}" — Version actuelle: ${p.current_version} du ${p.version_date}`).join("\n")}

Retourne en JSON :
{
  "references_found": [
    {
      "plan_number": "211-B2-04",
      "version_referenced": "B",
      "context": "l'email dit 'selon plan 211-B2-04 ind. B'",
      "is_outdated": true,
      "current_version": "C",
      "severity": "critical",
      "risk_description": "L'entreprise pourrait exécuter les travaux selon l'ancienne version"
    }
  ]
}

Si aucune référence à un plan n'est trouvée : { "references_found": [] }

Réponds UNIQUEMENT en JSON valide.`;
}

// Patterns to detect plan references with optional version indication
const PLAN_REF_PATTERNS = [
  // "plan 211-B2-04 ind. B" or "plan 211-B2-04 V-B"
  /plan\s+(\d{3}[-_][A-Z0-9]+[-_]\d{2})\s+(?:ind\.?\s*|[Vv][-_.]?\s*)([A-Z])/gi,
  // "211-B2-04 ind. B" or "211-B2-04 V-B" without "plan" prefix
  /(\d{3}[-_][A-Z0-9]+[-_]\d{2})\s+(?:ind\.?\s*|[Vv][-_.]?\s*)([A-Z])/gi,
  // "ARC-301 rev. B" or "ARC-301 version B"
  /([A-Z]{2,4}[-_]\d{2,4})\s+(?:rev\.?\s*|version\s*|[Vv][-_.]?\s*|ind\.?\s*)([A-Z])/gi,
  // "selon plan 211-B2-04" (without version — will be matched as null version)
  /(?:selon|cf\.?|voir|ref\.?|référence)\s+(?:plan\s+)?(\d{3}[-_][A-Z0-9]+[-_]\d{2})(?!\s*(?:ind|[Vv]|rev))/gi,
  // "selon plan ARC-301" (without version)
  /(?:selon|cf\.?|voir|ref\.?|référence)\s+(?:plan\s+)?([A-Z]{2,4}[-_]\d{2,4})(?!\s*(?:ind|[Vv]|rev))/gi,
];

/**
 * Extract plan references from text using regex patterns
 */
export function extractPlanReferences(text: string): { plan_number: string; version: string | null; context: string }[] {
  const found: { plan_number: string; version: string | null; context: string }[] = [];
  const seen = new Set<string>();

  for (const pattern of PLAN_REF_PATTERNS) {
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const planNumber = match[1].replace(/_/g, "-");
      const version = match[2] ? match[2].toUpperCase() : null;
      const key = `${planNumber}:${version || "null"}`;
      if (seen.has(key)) continue;
      seen.add(key);

      // Extract surrounding context (up to 50 chars around match)
      const start = Math.max(0, match.index - 30);
      const end = Math.min(text.length, match.index + match[0].length + 30);
      const context = text.slice(start, end).replace(/\s+/g, " ").trim();

      found.push({ plan_number: planNumber, version, context });
    }
  }

  return found;
}

/**
 * Check for plan references in an email (mock implementation)
 * In production, calls Claude API with buildPlanReferenceCheckPrompt()
 */
export async function checkPlanReferences(
  _emailId: string,
  emailBody: string,
  emailSubject: string,
  _projectId: string,
  existingPlans?: ExistingPlan[]
): Promise<PlanReferenceCheckResult> {
  if (!existingPlans || existingPlans.length === 0) {
    return { references_found: [] };
  }

  const text = `${emailSubject} ${emailBody}`;
  const extracted = extractPlanReferences(text);

  if (extracted.length === 0) {
    return { references_found: [] };
  }

  const references: PlanReference[] = [];

  for (const ref of extracted) {
    // Find matching plan in registry
    const matchingPlan = existingPlans.find(
      (p) => p.plan_number.toLowerCase() === ref.plan_number.toLowerCase()
    );

    if (!matchingPlan) continue;

    if (ref.version === null) {
      // Reference without version — warning level
      references.push({
        plan_number: ref.plan_number,
        version_referenced: null,
        context: ref.context,
        is_outdated: false,
        current_version: matchingPlan.current_version,
        severity: "warning",
        risk_description: `Référence au plan sans indication de version. Version actuelle : ${matchingPlan.current_version}`,
      });
    } else if (ref.version !== matchingPlan.current_version) {
      // Outdated version referenced — critical
      references.push({
        plan_number: ref.plan_number,
        version_referenced: ref.version,
        context: ref.context,
        is_outdated: true,
        current_version: matchingPlan.current_version,
        severity: "critical",
        risk_description: `Version ${ref.version} référencée mais version actuelle est ${matchingPlan.current_version}. Risque d'exécution sur ancienne version.`,
      });
    } else {
      // Current version referenced — OK, still report for tracking
      references.push({
        plan_number: ref.plan_number,
        version_referenced: ref.version,
        context: ref.context,
        is_outdated: false,
        current_version: matchingPlan.current_version,
        severity: "warning",
        risk_description: `Référence à la version courante ${ref.version}.`,
      });
    }
  }

  return { references_found: references };
}
