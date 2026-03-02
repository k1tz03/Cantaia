// ============================================================
// AI Email Classifier — Uses Claude to classify construction emails
// Supports 3 cases: existing project, new project, no project
// ============================================================

import {
  buildEmailClassifyPrompt,
  type EmailClassifyContext,
} from "./prompts";
import {
  classifyEmailResultSchema,
  type ClassifyEmailResult,
} from "../models/email-record";
import type { ApiUsageCallback } from "../tracking/api-cost-tracker";

export interface EmailForClassification {
  sender_email: string;
  sender_name: string;
  subject: string;
  body_preview: string;
  body_full?: string;
  received_at: string;
  recipients?: string[];
}

export interface ProjectForClassification {
  id: string;
  name: string;
  code: string | null;
  email_keywords: string[];
  email_senders: string[];
  city?: string;
  client_name?: string;
}

const DEFAULT_RESULT: ClassifyEmailResult = {
  match_type: "no_project",
  confidence: 0,
  project_id: null,
  classification: "info_only",
  classification_confidence: 50,
  email_category: "personal",
  reasoning: "",
  summary_fr: "—",
  summary_en: "—",
  summary_de: "—",
  contains_task: false,
  task: null,
};

/**
 * Classify an email using Claude API.
 * Returns enhanced classification result with 3 cases:
 *   A) existing_project — matches an existing project
 *   B) new_project — suggests creating a new project
 *   C) no_project — personal/admin/spam/newsletter
 */
export async function classifyEmail(
  anthropicApiKey: string,
  email: EmailForClassification,
  userProjects: ProjectForClassification[],
  model = "claude-sonnet-4-5-20250929",
  onUsage?: ApiUsageCallback
): Promise<ClassifyEmailResult> {
  console.log(`[classifyEmail] Starting classification for: "${email.subject}"`);
  console.log(`[classifyEmail] From: ${email.sender_name} <${email.sender_email}>`);
  console.log(`[classifyEmail] Projects available: ${userProjects.length}`);

  // Build projects list for the prompt
  const projectsList = userProjects
    .map(
      (p) =>
        `- "${p.name}" (code: ${p.code || "N/A"}, id: ${p.id}, ville: ${p.city || "N/A"}, client: ${p.client_name || "N/A"}, mots-clés: [${p.email_keywords.join(", ")}], expéditeurs connus: [${p.email_senders.join(", ")}])`
    )
    .join("\n");

  // Use full body if available, otherwise fall back to preview
  const bodyContent = email.body_full || email.body_preview;

  const ctx: EmailClassifyContext = {
    projects_list: projectsList || "(Aucun projet actif)",
    sender_email: email.sender_email,
    sender_name: email.sender_name,
    subject: email.subject,
    body_content: bodyContent.substring(0, 10000),
    received_at: email.received_at,
    recipients: email.recipients?.length ? email.recipients.join(", ") : undefined,
  };

  const prompt = buildEmailClassifyPrompt(ctx);

  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: anthropicApiKey });

    const response = await client.messages.create({
      model,
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    // Fire-and-forget usage tracking
    try {
      onUsage?.({
        model,
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
      });
    } catch { /* tracking must never fail */ }

    // Extract text content from response
    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      console.error("[classifyEmail] No text content in Claude response");
      return DEFAULT_RESULT;
    }

    console.log(`[classifyEmail] Claude raw response: ${textBlock.text.substring(0, 500)}`);

    // Parse JSON from response (handle markdown code blocks)
    let jsonStr = textBlock.text.trim();
    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim();
    }

    const parsed = JSON.parse(jsonStr);
    const validated = classifyEmailResultSchema.safeParse(parsed);

    if (!validated.success) {
      console.error("[classifyEmail] Invalid Claude response schema:", validated.error.issues);
      console.error("[classifyEmail] Parsed JSON was:", JSON.stringify(parsed));
      return DEFAULT_RESULT;
    }

    const result = validated.data;

    console.log(`[classifyEmail] Classification result:`, {
      match_type: result.match_type,
      confidence: result.confidence,
      project_id: result.project_id,
      classification: result.classification,
      email_category: result.email_category,
      reasoning: result.reasoning,
      contains_task: result.contains_task,
    });

    return result;
  } catch (err) {
    console.error("[classifyEmail] Error:", err instanceof Error ? err.message : err);
    return DEFAULT_RESULT;
  }
}

// ============================================================
// Local keyword-based classifier (no AI required)
// Used as fast first-pass before Claude, and as fallback if AI is unavailable
// ============================================================

/** Normalize text: lowercase + remove accents + normalize spaces */
function norm(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extract the first segment from a subject line (before – : or -).
 * Strips TR: RE: FW: prefixes first (double prefix too).
 * "TR: CENTRAL MALLEY – Planche de détail" → "central malley"
 * "TR: MLY – Note de séance" → "mly"
 * "RE: RTS : Menetrey-BasSmets – Rapport" → "rts"
 */
function extractFirstSegment(subject: string): string {
  const clean = (subject || "")
    .replace(/^(TR|RE|FW|FWD|WG|AW)\s*:\s*/gi, "")
    .replace(/^(TR|RE|FW|FWD|WG|AW)\s*:\s*/gi, "")
    .trim();
  const segments = clean.split(/\s*[–—]\s*|\s+:\s+/);
  return norm(segments[0] || "");
}

export interface LocalClassificationResult {
  projectId: string;
  score: number;
  confidence: number;
  reasons: string[];
}

/**
 * Classify an email locally by matching against project data.
 * Subject is the primary signal; body is secondary.
 *
 * Key design decisions:
 * - Subject-first matching: subject matches score higher than body matches
 * - First segment bonus: the first segment of the subject (before – or :) is
 *   often the project name/code in construction emails
 * - PENALTY: if the first segment is a clear identifier that does NOT match
 *   the candidate project, score is penalized to prevent false positives
 * - Minimum threshold of 6 + name/ref match required prevents false positives
 */
export function classifyEmailByKeywords(
  email: { subject: string; sender_email: string; sender_name?: string; body_preview?: string; recipients?: string[] },
  projects: ProjectForClassification[]
): LocalClassificationResult | null {
  const subjectNorm = norm(email.subject || "");
  const firstSegment = extractFirstSegment(email.subject);
  const bodyNorm = norm((email.body_preview || "").substring(0, 5000));
  const senderLower = (email.sender_email || "").toLowerCase();

  let bestMatch: LocalClassificationResult | null = null;

  for (const project of projects) {
    let score = 0;
    let hasNameOrRefMatch = false;
    const reasons: string[] = [];

    const nameNorm = norm(project.name || "");
    const nameWords = nameNorm.split(/[\s\-_/,]+/).filter((w) => w.length >= 3);

    // Build list of project identifiers for penalty check
    const codeNorm = project.code ? norm(project.code) : "";
    const codeAlpha = codeNorm.replace(/[^a-z]/g, "");
    const keywords = (project.email_keywords || []).map((k) => norm(k)).filter((k) => k.length >= 2);

    // ── RULE 1: Full project name in subject (strongest signal) ──
    if (nameNorm && subjectNorm.includes(nameNorm)) {
      score += 10;
      hasNameOrRefMatch = true;
      reasons.push(`Nom complet "${project.name}" dans sujet`);
    }
    // ── RULE 2: Full project name in body (weaker) ──
    else if (nameNorm && bodyNorm.includes(nameNorm)) {
      score += 6;
      hasNameOrRefMatch = true;
      reasons.push(`Nom complet "${project.name}" dans corps`);
    }
    // ── RULE 3: Individual name words in subject (min 4 chars to avoid noise) ──
    else {
      for (const word of nameWords.filter((w) => w.length >= 4)) {
        if (subjectNorm.includes(word)) {
          score += 4;
          hasNameOrRefMatch = true;
          reasons.push(`Mot "${word}" dans sujet`);
        } else if (bodyNorm.includes(word)) {
          score += 2;
          hasNameOrRefMatch = true;
          reasons.push(`Mot "${word}" dans corps`);
        }
      }
    }

    // ── RULE 4: Full project code in subject or body ──
    if (codeNorm && codeNorm.length >= 3 && (subjectNorm.includes(codeNorm) || bodyNorm.includes(codeNorm))) {
      score += 8;
      hasNameOrRefMatch = true;
      reasons.push(`Ref "${project.code}"`);
    }

    // ── RULE 5: Code alpha prefix as isolated token in subject ──
    if (codeAlpha && codeAlpha.length >= 2) {
      const tokenRegex = new RegExp(`(^|[\\s\\-:.,(])${codeAlpha}($|[\\s\\-:.,(])`, "i");
      if (tokenRegex.test(subjectNorm)) {
        score += 7;
        hasNameOrRefMatch = true;
        reasons.push(`Code "${codeAlpha.toUpperCase()}" dans sujet`);
      }
    }

    // ── RULE 6: Email keywords in subject ──
    for (const kw of keywords) {
      if (kw.length >= 3 && subjectNorm.includes(kw)) {
        score += 4;
        reasons.push(`Mot-cle "${kw}" sujet`);
      } else if (kw.length >= 3 && bodyNorm.includes(kw)) {
        score += 2;
        reasons.push(`Mot-cle "${kw}" corps`);
      }
    }

    // ── RULE 7: Known sender ──
    if (project.email_senders && project.email_senders.length > 0) {
      for (const knownSender of project.email_senders) {
        if (senderLower.includes(knownSender.toLowerCase())) {
          score += 7;
          reasons.push(`Expediteur "${knownSender}"`);
        }
      }
    }

    // ── RULE 7b: Known sender in recipients (TO/CC) ──
    if (project.email_senders && project.email_senders.length > 0 && email.recipients?.length) {
      for (const knownSender of project.email_senders) {
        const knownLower = knownSender.toLowerCase();
        for (const recipient of email.recipients) {
          if (recipient.toLowerCase().includes(knownLower)) {
            score += 5;
            reasons.push(`Destinataire "${recipient}" = expediteur connu "${knownSender}"`);
          }
        }
      }
    }

    // ── RULE 8: Client name in subject ──
    if (project.client_name) {
      const clientNorm = norm(project.client_name);
      if (clientNorm.length >= 3 && subjectNorm.includes(clientNorm)) {
        score += 3;
        reasons.push(`Client "${project.client_name}"`);
      }
    }

    // ── PENALTY: First segment doesn't match this project ──
    // In Swiss construction emails, the first segment (before – or :) is typically
    // the project name or code. If it's a clear identifier that doesn't match
    // this project, penalize heavily to prevent false positives.
    if (firstSegment && firstSegment.length >= 2 && firstSegment.length <= 30) {
      const matchesProject =
        nameNorm.includes(firstSegment) ||
        firstSegment.includes(nameNorm) ||
        (codeNorm && (codeNorm.includes(firstSegment) || firstSegment.includes(codeNorm))) ||
        (codeAlpha && codeAlpha.length >= 2 && (codeAlpha === firstSegment || firstSegment.includes(codeAlpha))) ||
        nameWords.some((w) => w.length >= 3 && (firstSegment.includes(w) || w.includes(firstSegment))) ||
        keywords.some((k) => k.length >= 3 && (firstSegment.includes(k) || k.includes(firstSegment)));

      if (matchesProject) {
        // BONUS: first segment matches this project → strong positive signal
        score += 5;
        reasons.push(`BONUS: sujet commence par "${firstSegment}" = ce projet`);
      } else if (firstSegment.length >= 2) {
        // HEAVY PENALTY: first segment is a clear identifier NOT matching this project
        score -= 15;
        reasons.push(`PENALITE: sujet commence par "${firstSegment}" != ce projet`);
      }
    }

    if (reasons.length > 0) {
      console.log(`[classifyByKeywords]   "${project.name}": score=${score} [${reasons.join("; ")}]`);
    }

    // STRICT THRESHOLD: score >= 8 AND must have at least one name/ref match
    // Raised from 6 to 8 to avoid false positives that bypass AI classification
    if (score >= 8 && hasNameOrRefMatch && score > (bestMatch?.score ?? 0)) {
      bestMatch = {
        projectId: project.id,
        score,
        confidence: Math.min(score / 18, 0.99),
        reasons,
      };
    }
  }

  if (bestMatch) {
    console.log(
      `[classifyByKeywords] MATCH: project="${projects.find((p) => p.id === bestMatch!.projectId)?.name}" score=${bestMatch.score}`
    );
    return bestMatch;
  }

  console.log(`[classifyByKeywords] NO MATCH for "${email.subject}"`);
  return null;
}

/**
 * Check if the subject's first segment is a clear project identifier
 * that doesn't match any known project. Used to skip AI classification
 * for emails clearly about unknown projects.
 */
export function isUnknownProjectSubject(
  subject: string,
  projects: ProjectForClassification[]
): boolean {
  const firstSegment = extractFirstSegment(subject);
  if (!firstSegment || firstSegment.length < 2 || firstSegment.length > 25) return false;

  // Only consider segments that look like identifiers (alpha, possibly with spaces)
  if (!/^[a-z\s]+$/i.test(firstSegment)) return false;

  // Check if the first segment matches any project
  for (const project of projects) {
    const nameNorm = norm(project.name || "");
    const codeNorm = project.code ? norm(project.code) : "";
    const codeAlpha = codeNorm.replace(/[^a-z]/g, "");
    const nameWords = nameNorm.split(/[\s\-_/,]+/).filter((w) => w.length >= 3);
    const keywords = (project.email_keywords || []).map((k) => norm(k)).filter((k) => k.length >= 2);

    const matches =
      nameNorm.includes(firstSegment) ||
      firstSegment.includes(nameNorm) ||
      (codeNorm && (codeNorm.includes(firstSegment) || firstSegment.includes(codeNorm))) ||
      (codeAlpha && (codeAlpha === firstSegment || firstSegment.includes(codeAlpha))) ||
      nameWords.some((w) => firstSegment.includes(w) || w.includes(firstSegment)) ||
      keywords.some((k) => firstSegment.includes(k) || k.includes(firstSegment));

    if (matches) return false;
  }

  return true;
}
