// ============================================================
// Email Classification Learning
// Learns from user actions (confirm/correct/reject) to classify
// emails locally without calling Claude when rules match.
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js";

interface LearnFromActionParams {
  supabase: SupabaseClient;
  organizationId: string;
  senderEmail: string;
  subject: string;
  projectId: string | null;
  action: "confirm" | "correct" | "reject";
  previousProjectId?: string | null;
  /** Optional — if provided, a feedback record will be saved in email_classification_feedback */
  emailId?: string;
  userId?: string;
  originalClassification?: string;
  correctedClassification?: string;
}

/**
 * Learn from user action on email classification.
 * Creates or updates rules for sender domain, sender email, and subject keywords.
 * When action is "correct", also checks whether repeated corrections should auto-promote rules.
 */
export async function learnFromClassificationAction(params: LearnFromActionParams): Promise<void> {
  const {
    supabase,
    organizationId,
    senderEmail,
    subject,
    projectId,
    action,
    previousProjectId,
    emailId,
    userId,
    originalClassification,
    correctedClassification,
  } = params;

  const senderDomain = senderEmail.split("@")[1]?.toLowerCase();
  const senderLower = senderEmail.toLowerCase();

  // Persist feedback record if caller provided email context
  if (emailId && userId) {
    await saveFeedbackRecord(supabase, {
      organizationId,
      emailId,
      userId,
      originalProjectId: previousProjectId ?? null,
      correctedProjectId: action === "correct" ? (projectId ?? null) : null,
      originalClassification: originalClassification ?? null,
      correctedClassification: correctedClassification ?? null,
    });
  }

  if (action === "confirm" && projectId) {
    // User confirmed AI suggestion → reinforce rules
    await upsertRule(supabase, organizationId, "sender_email", senderLower, projectId, "project", "confirm");
    if (senderDomain) {
      await upsertRule(supabase, organizationId, "sender_domain", senderDomain, projectId, "project", "confirm");
    }
    // Extract keywords from subject (words > 4 chars, not common words)
    const keywords = extractKeywords(subject);
    for (const kw of keywords.slice(0, 3)) {
      await upsertRule(supabase, organizationId, "subject_keyword", kw, projectId, "project", "confirm");
    }
  } else if (action === "correct" && projectId) {
    // User changed the project → override old rules, create new ones
    if (previousProjectId) {
      await overrideRulesForProject(supabase, organizationId, senderLower, previousProjectId);
      if (senderDomain) {
        await overrideRulesForProject(supabase, organizationId, senderDomain, previousProjectId);
      }
    }
    await upsertRule(supabase, organizationId, "sender_email", senderLower, projectId, "project", "confirm");
    if (senderDomain) {
      await upsertRule(supabase, organizationId, "sender_domain", senderDomain, projectId, "project", "confirm");
    }

    // After a correction, check whether repeated corrections should auto-promote rules
    await autoPromoteRulesFromFeedback(supabase, organizationId, senderLower, subject, projectId);
  } else if (action === "reject") {
    // User rejected — mark as not a project
    await upsertRule(supabase, organizationId, "sender_email", senderLower, null, "personal", "confirm");
    if (senderDomain) {
      await upsertRule(supabase, organizationId, "sender_domain", senderDomain, null, "personal", "confirm");
    }
  }
}

/**
 * Save a feedback record to the email_classification_feedback table.
 * Called after a user correction so patterns can be analysed later.
 */
export async function saveFeedbackRecord(
  supabase: SupabaseClient,
  params: {
    organizationId: string;
    emailId: string;
    userId: string;
    originalProjectId: string | null;
    correctedProjectId: string | null;
    originalClassification: string | null;
    correctedClassification: string | null;
  }
): Promise<void> {
  try {
    await (supabase as any)
      .from("email_classification_feedback")
      .insert({
        organization_id: params.organizationId,
        email_id: params.emailId,
        original_project_id: params.originalProjectId,
        corrected_project_id: params.correctedProjectId,
        original_classification: params.originalClassification,
        corrected_classification: params.correctedClassification,
        created_by: params.userId,
      });
  } catch (err) {
    // Feedback table might not exist — fail silently
    console.warn("[classification-learning] saveFeedbackRecord failed:", err);
  }
}

/**
 * Auto-promote rules when the same sender or subject keyword has been corrected
 * multiple times. This means the system can now skip Claude for these patterns.
 *
 * Thresholds:
 *  - ≥2 corrections from same sender email → auto-create/reinforce sender rule
 *  - ≥3 corrections sharing a subject keyword → auto-create/reinforce keyword rule
 *
 * The `email_classification_feedback` table has no sender/subject columns,
 * so we join with email_records via email_id to obtain them.
 */
export async function autoPromoteRulesFromFeedback(
  supabase: SupabaseClient,
  orgId: string,
  senderEmail: string,
  subject: string,
  projectId: string
): Promise<void> {
  const senderLower = senderEmail.toLowerCase();

  // ── 1. Count corrections from same sender (join via email_records) ──
  try {
    const { data: senderCorrections, error: senderErr } = await (supabase as any)
      .from("email_classification_feedback")
      .select("id, email_records!inner(sender_email)")
      .eq("organization_id", orgId)
      .not("corrected_project_id", "is", null); // only real corrections

    if (!senderErr && senderCorrections) {
      const fromSameSender = (senderCorrections as Array<{ id: string; email_records: { sender_email: string | null } }>)
        .filter((row) => {
          const rowSender = (row.email_records?.sender_email || "").toLowerCase();
          return rowSender === senderLower;
        });

      if (fromSameSender.length >= 2) {
        // Auto-promote: reinforce sender rule with extra confidence
        await upsertRule(supabase, orgId, "sender_email", senderLower, projectId, "project", "confirm");
        if (process.env.NODE_ENV !== "test") {
          console.log(`[classification-learning] Auto-promoted sender rule for "${senderLower}" (${fromSameSender.length} corrections)`);
        }
      }
    }
  } catch (err) {
    console.warn("[classification-learning] autoPromoteRules sender check failed:", err);
  }

  // ── 2. Count corrections sharing a subject keyword (join via email_records) ──
  const keywords = extractKeywords(subject);
  if (keywords.length === 0) return;

  try {
    const { data: allCorrections, error: kwErr } = await (supabase as any)
      .from("email_classification_feedback")
      .select("id, email_records!inner(subject)")
      .eq("organization_id", orgId)
      .not("corrected_project_id", "is", null);

    if (!kwErr && allCorrections) {
      const corrections = allCorrections as Array<{ id: string; email_records: { subject: string | null } }>;

      for (const kw of keywords.slice(0, 5)) {
        if (kw.length < 4) continue; // skip very short keywords

        const matchingCorrections = corrections.filter((row) => {
          const rowSubject = (row.email_records?.subject || "").toLowerCase();
          return rowSubject.includes(kw);
        });

        if (matchingCorrections.length >= 3) {
          await upsertRule(supabase, orgId, "subject_keyword", kw, projectId, "project", "confirm");
          if (process.env.NODE_ENV !== "test") {
            console.log(`[classification-learning] Auto-promoted keyword rule for "${kw}" (${matchingCorrections.length} corrections)`);
          }
        }
      }
    }
  } catch (err) {
    console.warn("[classification-learning] autoPromoteRules keyword check failed:", err);
  }
}

/**
 * Check local rules before calling Claude.
 * Returns a project_id if a high-confidence rule matches, or null to proceed with AI.
 */
export async function checkLocalRules(
  supabase: SupabaseClient,
  organizationId: string,
  senderEmail: string
): Promise<{ projectId: string; confidence: number } | null> {
  const senderLower = senderEmail.toLowerCase();
  const senderDomain = senderLower.split("@")[1];

  // Check exact sender email rules first (highest priority)
  const { data: emailRules } = await supabase
    .from("email_classification_rules")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("rule_type", "sender_email")
    .eq("rule_value", senderLower)
    .eq("is_active", true)
    .order("times_confirmed", { ascending: false })
    .limit(1);

  if (emailRules?.[0] && emailRules[0].project_id && emailRules[0].times_confirmed >= 2) {
    const rule = emailRules[0];
    // High confidence if confirmed multiple times and rarely overridden
    const reliability = rule.times_confirmed / (rule.times_confirmed + rule.times_overridden);
    if (reliability >= 0.8) {
      return {
        projectId: rule.project_id,
        confidence: Math.min(0.95, 0.80 + (rule.confidence_boost || 0.10)),
      };
    }
  }

  // Check domain rules (lower priority)
  if (senderDomain) {
    const { data: domainRules } = await supabase
      .from("email_classification_rules")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("rule_type", "sender_domain")
      .eq("rule_value", senderDomain)
      .eq("is_active", true)
      .order("times_confirmed", { ascending: false })
      .limit(1);

    if (domainRules?.[0] && domainRules[0].project_id && domainRules[0].times_confirmed >= 3) {
      const rule = domainRules[0];
      const reliability = rule.times_confirmed / (rule.times_confirmed + rule.times_overridden);
      if (reliability >= 0.8) {
        return {
          projectId: rule.project_id,
          confidence: Math.min(0.90, 0.70 + (rule.confidence_boost || 0.10)),
        };
      }
    }
  }

  return null;
}

// ── Internal helpers ──

async function upsertRule(
  supabase: SupabaseClient,
  organizationId: string,
  ruleType: string,
  ruleValue: string,
  projectId: string | null,
  classification: string,
  action: "confirm" | "override"
): Promise<void> {
  // Check if rule exists
  const { data: existing } = await supabase
    .from("email_classification_rules")
    .select("id, times_confirmed, times_overridden")
    .eq("organization_id", organizationId)
    .eq("rule_type", ruleType)
    .eq("rule_value", ruleValue)
    .eq("project_id", projectId)
    .limit(1);

  if (existing?.[0]) {
    // Update existing rule
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (action === "confirm") {
      updates.times_confirmed = (existing[0].times_confirmed || 0) + 1;
    } else {
      updates.times_overridden = (existing[0].times_overridden || 0) + 1;
    }
    // Deactivate if overridden more than confirmed
    if ((updates.times_overridden as number || existing[0].times_overridden || 0) >
        (updates.times_confirmed as number || existing[0].times_confirmed || 0)) {
      updates.is_active = false;
    }
    await supabase
      .from("email_classification_rules")
      .update(updates as Record<string, unknown>)
      .eq("id", existing[0].id);
  } else if (action === "confirm") {
    // Create new rule
    await supabase
      .from("email_classification_rules")
      .insert({
        organization_id: organizationId,
        rule_type: ruleType,
        rule_value: ruleValue,
        project_id: projectId,
        classification,
        times_confirmed: 1,
        times_overridden: 0,
        confidence_boost: 0.10,
        is_active: true,
      } as Record<string, unknown>);
  }
}

async function overrideRulesForProject(
  supabase: SupabaseClient,
  organizationId: string,
  ruleValue: string,
  projectId: string
): Promise<void> {
  const { data: rules } = await supabase
    .from("email_classification_rules")
    .select("id, times_overridden")
    .eq("organization_id", organizationId)
    .eq("rule_value", ruleValue)
    .eq("project_id", projectId);

  for (const rule of rules || []) {
    const newOverridden = (rule.times_overridden || 0) + 1;
    await supabase
      .from("email_classification_rules")
      .update({
        times_overridden: newOverridden,
        is_active: false, // Deactivate overridden rules
        updated_at: new Date().toISOString(),
      } as Record<string, unknown>)
      .eq("id", rule.id);
  }
}

/** Extract meaningful keywords from subject line */
function extractKeywords(subject: string): string[] {
  const stopWords = new Set([
    "le", "la", "les", "un", "une", "des", "de", "du", "au", "aux",
    "et", "ou", "en", "pour", "par", "avec", "dans", "sur", "sous",
    "re:", "fw:", "fwd:", "tr:", "wg:", "aw:",
    "the", "and", "for", "from", "with", "about",
    "objet", "mail", "email", "message", "bonjour", "merci",
  ]);

  return subject
    .toLowerCase()
    .replace(/[^a-zàâäéèêëïîôùûüç\s-]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 4 && !stopWords.has(w))
    .slice(0, 5);
}
