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
}

/**
 * Learn from user action on email classification.
 * Creates or updates rules for sender domain, sender email, and subject keywords.
 */
export async function learnFromClassificationAction(params: LearnFromActionParams): Promise<void> {
  const { supabase, organizationId, senderEmail, subject, projectId, action, previousProjectId } = params;

  const senderDomain = senderEmail.split("@")[1]?.toLowerCase();
  const senderLower = senderEmail.toLowerCase();

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
  } else if (action === "reject") {
    // User rejected — mark as not a project
    await upsertRule(supabase, organizationId, "sender_email", senderLower, null, "personal", "confirm");
    if (senderDomain) {
      await upsertRule(supabase, organizationId, "sender_domain", senderDomain, null, "personal", "confirm");
    }
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
