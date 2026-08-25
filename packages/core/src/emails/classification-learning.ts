// ============================================================
// Email Classification Learning
// Learns from user actions (confirm/correct/reject) to classify
// emails locally without calling Claude when rules match.
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { logLearningFailure } from "../learning/log";

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
    // User confirmed AI suggestion → reinforce rules.
    // NB: only sender_email / sender_domain rules are written. `subject_keyword`
    // rules were upserted here for months but NO reader ever consulted them
    // (checkLocalRules / checkRejectRules match on sender only), so they merely
    // bloated email_classification_rules. Writing stopped in the 08/2026 audit;
    // re-add a subject_keyword tier in checkLocalRules before writing them again.
    await upsertRule(supabase, organizationId, "sender_email", senderLower, projectId, "project", "confirm");
    if (senderDomain) {
      await upsertRule(supabase, organizationId, "sender_domain", senderDomain, projectId, "project", "confirm");
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
    await autoPromoteRulesFromFeedback(supabase, organizationId, senderLower, projectId);
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
    const { error } = await (supabase as any)
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
    // AUDIT 08/2026 — supabase-js ne throw pas : le catch ne voyait jamais un
    // insert refusé, et le feedback (qui alimente le benchmark C2) se perdait
    // en silence. Tout échec part désormais dans learning_events.
    if (error) {
      await logLearningFailure(supabase, {
        organizationId: params.organizationId,
        module: "mail",
        error,
        context: { table: "email_classification_feedback", op: "insert" },
      });
    }
  } catch (err) {
    await logLearningFailure(supabase, {
      organizationId: params.organizationId,
      module: "mail",
      error: err,
      context: { table: "email_classification_feedback", op: "insert" },
    });
  }
}

/**
 * Auto-promote a sender rule when the same sender has been corrected to the
 * same project multiple times, so the system can skip Claude for that sender.
 *
 * Threshold: ≥2 corrections from the same sender email → reinforce sender rule.
 *
 * NB: subject-keyword auto-promotion was removed in the 08/2026 audit — no
 * reader ever consulted `subject_keyword` rules (checkLocalRules / checkRejectRules
 * match on sender only), so promoting them merely bloated the rules table.
 *
 * The `email_classification_feedback` table has no sender column, so we join
 * with email_records via email_id to obtain it.
 */
export async function autoPromoteRulesFromFeedback(
  supabase: SupabaseClient,
  orgId: string,
  senderEmail: string,
  projectId: string
): Promise<void> {
  const senderLower = senderEmail.toLowerCase();

  // Count corrections from same sender (join via email_records).
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

  // Check exact sender email rules first (highest priority).
  // Requires times_confirmed >= 3 (i.e., 3 distinct emails from this sender were
  // confirmed for the same project). This prevents a single high-confidence AI
  // classification from creating an overly broad rule that captures ALL emails
  // from a sender who works across multiple projects.
  const { data: emailRules } = await supabase
    .from("email_classification_rules")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("rule_type", "sender_email")
    .eq("rule_value", senderLower)
    .eq("is_active", true)
    .order("times_confirmed", { ascending: false })
    .limit(1);

  if (emailRules?.[0] && emailRules[0].project_id && emailRules[0].times_confirmed >= 3) {
    const rule = emailRules[0];
    // High confidence if confirmed multiple times and rarely overridden.
    // Guard against NULL times_overridden → NaN (which fails `>= 0.8` silently).
    const overridden = rule.times_overridden || 0;
    const reliability = rule.times_confirmed / Math.max(1, rule.times_confirmed + overridden);
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
      const overridden = rule.times_overridden || 0;
      const reliability = rule.times_confirmed / Math.max(1, rule.times_confirmed + overridden);
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

export interface RejectRuleMatch {
  /** 'sender_email' | 'sender_domain' — la règle reject qui a matché. */
  ruleType: string;
  /** Fiabilité de la règle : times_confirmed / (confirmed + overridden). */
  confidence: number;
  timesConfirmed: number;
}

/**
 * Règles REJECT : signal négatif fort appris des rejets utilisateur.
 *
 * AUDIT 08/2026 — `learnFromClassificationAction(action: "reject")` écrit des
 * règles `project_id NULL / classification 'personal'` depuis toujours, mais
 * AUCUN lecteur ne les consultait : l'utilisateur pouvait rejeter le même
 * expéditeur dix fois, l'email suivant repartait quand même en classification
 * IA (et souvent vers le même faux positif). Ce lecteur ferme la boucle :
 * un expéditeur/domaine rejeté ≥2 fois avec une fiabilité ≥0.7 est traité
 * comme « pas un email projet » sans appel IA.
 *
 * Priorité : à appeler APRÈS `checkLocalRules` — une règle positive fiable
 * (≥3 confirmations) gagne sur un vieux reject.
 */
export async function checkRejectRules(
  supabase: SupabaseClient,
  organizationId: string,
  senderEmail: string
): Promise<RejectRuleMatch | null> {
  const senderLower = senderEmail.toLowerCase();
  const senderDomain = senderLower.split("@")[1];

  const candidates: Array<{ ruleType: string; ruleValue: string }> = [
    { ruleType: "sender_email", ruleValue: senderLower },
  ];
  if (senderDomain) {
    candidates.push({ ruleType: "sender_domain", ruleValue: senderDomain });
  }

  for (const { ruleType, ruleValue } of candidates) {
    const { data: rules } = await supabase
      .from("email_classification_rules")
      .select("times_confirmed, times_overridden")
      .eq("organization_id", organizationId)
      .eq("rule_type", ruleType)
      .eq("rule_value", ruleValue)
      .eq("classification", "personal")
      .is("project_id", null)
      .eq("is_active", true)
      .order("times_confirmed", { ascending: false })
      .limit(1);

    const rule = rules?.[0];
    if (!rule) continue;

    const confirmed = rule.times_confirmed || 0;
    const overridden = rule.times_overridden || 0;
    if (confirmed < 2) continue; // un rejet isolé ne fait pas une règle

    const reliability = confirmed / Math.max(1, confirmed + overridden);
    if (reliability >= 0.7) {
      return { ruleType, confidence: reliability, timesConfirmed: confirmed };
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
  // Check if rule exists.
  // B11: PostgREST turns `.eq("project_id", null)` into `project_id=eq.null`,
  // which never matches a real SQL NULL — every project-less rule was therefore
  // re-inserted instead of being updated. Use `.is()` for the NULL case.
  const existingQuery = supabase
    .from("email_classification_rules")
    .select("id, times_confirmed, times_overridden")
    .eq("organization_id", organizationId)
    .eq("rule_type", ruleType)
    .eq("rule_value", ruleValue);

  const { data: existing } = await (projectId === null || projectId === undefined
    ? existingQuery.is("project_id", null)
    : existingQuery.eq("project_id", projectId)
  ).limit(1);

  // AUDIT 08/2026 — écritures désormais vérifiées ({error}) : une règle jamais
  // écrite était un apprentissage silencieusement perdu.
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
    const { error: updateError } = await supabase
      .from("email_classification_rules")
      .update(updates as Record<string, unknown>)
      .eq("id", existing[0].id);
    if (updateError) {
      await logLearningFailure(supabase, {
        organizationId,
        module: "mail",
        error: updateError,
        context: { table: "email_classification_rules", op: "update", rule_type: ruleType },
      });
    }
  } else if (action === "confirm") {
    // Create new rule
    const { error: insertError } = await supabase
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
    if (insertError) {
      await logLearningFailure(supabase, {
        organizationId,
        module: "mail",
        error: insertError,
        context: { table: "email_classification_rules", op: "insert", rule_type: ruleType },
      });
    }
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
    const { error: overrideError } = await supabase
      .from("email_classification_rules")
      .update({
        times_overridden: newOverridden,
        is_active: false, // Deactivate overridden rules
        updated_at: new Date().toISOString(),
      } as Record<string, unknown>)
      .eq("id", rule.id);
    if (overrideError) {
      await logLearningFailure(supabase, {
        organizationId,
        module: "mail",
        error: overrideError,
        context: { table: "email_classification_rules", op: "override" },
      });
    }
  }
}

