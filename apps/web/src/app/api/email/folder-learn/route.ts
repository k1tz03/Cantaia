import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logLearningEvent, logLearningFailure } from "@cantaia/core/learning";

/**
 * POST /api/email/folder-learn
 * Records that a user moved an email to a specific folder.
 * Creates/updates rules for sender_email, sender_domain, and subject keywords.
 *
 * Body: { email_id, folder_id, folder_name, sender_email, subject, suggested_folder_id? }
 *
 * D-FIX9 — `suggested_folder_id` carries what `/api/email/suggest-folder`
 * proposed. Without it the engine could only compare the chosen folder against
 * its OWN stored rules, so an AI suggestion the user rejected produced no
 * negative signal at all and kept being proposed. When the suggestion differs
 * from the folder actually picked, every rule pointing at the suggested folder
 * is explicitly marked overridden.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();
    const { data: profile } = await (admin as any)
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.organization_id) {
      return NextResponse.json({ error: "No organization" }, { status: 400 });
    }

    const body = await request.json();
    const { folder_id, sender_email, subject, suggested_folder_id } = body;

    if (!folder_id || !sender_email) {
      return NextResponse.json({ error: "folder_id and sender_email required" }, { status: 400 });
    }

    const orgId = profile.organization_id;

    // D-FIX9 — the user was shown a suggestion and picked a different folder:
    // that is a rejection, and it must cost the suggested folder something.
    if (suggested_folder_id && suggested_folder_id !== folder_id) {
      await recordSuggestionOverride(admin, orgId, suggested_folder_id, sender_email, subject);
    }

    // AUDIT 08/2026 — journal d'apprentissage : issue de la suggestion
    // (le `suggestion_shown` correspondant est loggé par /api/email/suggest-folder).
    // Rend l'accept-rate des suggestions de dossier mesurable dans learning_events.
    if (suggested_folder_id) {
      const accepted = suggested_folder_id === folder_id;
      await logLearningEvent(admin, {
        organizationId: orgId,
        module: "mail_folders",
        eventType: accepted ? "suggestion_accepted" : "suggestion_rejected",
        wasCorrected: !accepted,
        payload: { suggested_folder_id, chosen_folder_id: folder_id },
      });
    }

    // 1. Upsert sender_email rule
    await upsertRule(admin, orgId, "sender_email", sender_email.toLowerCase(), folder_id);

    // 2. Upsert sender_domain rule
    const domain = sender_email.split("@")[1]?.toLowerCase();
    if (domain) {
      await upsertRule(admin, orgId, "sender_domain", domain, folder_id);
    }

    // 3. Extract and upsert subject keywords (words >= 4 chars, skip common words)
    if (subject) {
      const keywords = extractKeywords(subject);
      for (const kw of keywords.slice(0, 3)) { // top 3 keywords
        await upsertRule(admin, orgId, "subject_keyword", kw, folder_id);
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[folder-learn] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

const STOP_WORDS = new Set([
  "pour", "dans", "avec", "plus", "sans", "votre", "notre", "cette", "comme",
  "fait", "faire", "être", "avoir", "cher", "chère", "bonjour", "merci",
  "objet", "date", "mail", "email", "from", "sent", "subject", "the",
  "this", "that", "with", "from", "your", "have", "been", "will", "would",
  "could", "should", "about", "into", "over", "also", "just", "than",
  "very", "some", "other", "hier", "heute", "bitte", "liebe", "lieber",
  "re:", "fw:", "fwd:", "ref:", "tr:",
]);

function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-zà-ÿ0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOP_WORDS.has(w))
    .sort((a, b) => b.length - a.length); // longer words = more discriminating
}

/**
 * Penalise the rules that produced a suggestion the user just declined.
 * Scoped to the signals this very email would have matched (sender, domain,
 * subject keywords) so an unrelated rule for the same folder is untouched.
 */
async function recordSuggestionOverride(
  admin: any,
  orgId: string,
  suggestedFolderId: string,
  senderEmail: string,
  subject?: string,
) {
  const signals: Array<{ type: string; value: string }> = [
    { type: "sender_email", value: senderEmail.toLowerCase() },
  ];
  const domain = senderEmail.split("@")[1]?.toLowerCase();
  if (domain) signals.push({ type: "sender_domain", value: domain });
  if (subject) {
    for (const kw of extractKeywords(subject).slice(0, 3)) {
      signals.push({ type: "subject_keyword", value: kw });
    }
  }

  for (const signal of signals) {
    const { data: rules, error } = await (admin as any)
      .from("email_folder_rules")
      .select("id, times_confirmed, times_overridden")
      .eq("organization_id", orgId)
      .eq("rule_type", signal.type)
      .eq("rule_value", signal.value)
      .eq("folder_id", suggestedFolderId);

    if (error) {
      console.warn(`[folder-learn] override lookup failed (${signal.type}): ${error.message}`);
      continue;
    }

    for (const rule of rules || []) {
      const timesOverridden = (rule.times_overridden || 0) + 1;
      const { error: updateErr } = await (admin as any)
        .from("email_folder_rules")
        .update({
          times_overridden: timesOverridden,
          is_active: (rule.times_confirmed || 0) > timesOverridden,
          updated_at: new Date().toISOString(),
        })
        .eq("id", rule.id);
      if (updateErr) {
        console.warn(`[folder-learn] override write failed for rule ${rule.id}: ${updateErr.message}`);
      }
    }
  }
}

async function upsertRule(
  admin: any,
  orgId: string,
  ruleType: string,
  ruleValue: string,
  folderId: string,
) {
  // B10: the unique index is on (organization_id, rule_type, rule_value, folder_id),
  // so SEVERAL rows legitimately coexist for the same (org, type, value) once a
  // user has moved similar emails to two different folders. `maybeSingle()`
  // then failed with PGRST116 ("multiple rows returned") and the whole
  // folder-learn request 500'd. Fetch them all instead.
  const { data: existingRules } = await (admin as any)
    .from("email_folder_rules")
    .select("id, folder_id, times_confirmed, times_overridden")
    .eq("organization_id", orgId)
    .eq("rule_type", ruleType)
    .eq("rule_value", ruleValue)
    .order("times_confirmed", { ascending: false });

  const rules: Array<{
    id: string;
    folder_id: string;
    times_confirmed: number | null;
    times_overridden: number | null;
  }> = existingRules || [];

  const matching = rules.find((r) => r.folder_id === folderId);

  // AUDIT 08/2026 — ces écritures étaient lancées sans vérifier `{error}`
  // (supabase-js ne throw pas) : une règle jamais écrite = un apprentissage
  // silencieusement perdu. Tout échec part désormais dans learning_events.

  // Every rule pointing elsewhere has just been overridden by this user action
  for (const rule of rules) {
    if (rule.folder_id === folderId) continue;
    const timesOverridden = (rule.times_overridden || 0) + 1;
    const { error: overrideErr } = await (admin as any)
      .from("email_folder_rules")
      .update({
        times_overridden: timesOverridden,
        is_active: (rule.times_confirmed || 0) > timesOverridden,
        updated_at: new Date().toISOString(),
      })
      .eq("id", rule.id);
    if (overrideErr) {
      await logLearningFailure(admin, {
        organizationId: orgId,
        module: "mail_folders",
        error: overrideErr,
        context: { table: "email_folder_rules", op: "override", rule_type: ruleType },
      });
    }
  }

  if (matching) {
    // Same folder → confirm the rule
    const { error: confirmErr } = await (admin as any)
      .from("email_folder_rules")
      .update({
        times_confirmed: (matching.times_confirmed || 0) + 1,
        is_active: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", matching.id);
    if (confirmErr) {
      await logLearningFailure(admin, {
        organizationId: orgId,
        module: "mail_folders",
        error: confirmErr,
        context: { table: "email_folder_rules", op: "confirm", rule_type: ruleType },
      });
    }
    return;
  }

  // New rule for this folder
  const { error: insertErr } = await (admin as any)
    .from("email_folder_rules")
    .insert({
      organization_id: orgId,
      rule_type: ruleType,
      rule_value: ruleValue,
      folder_id: folderId,
      times_confirmed: 1,
      times_overridden: 0,
      is_active: true,
    });
  if (insertErr) {
    await logLearningFailure(admin, {
      organizationId: orgId,
      module: "mail_folders",
      error: insertErr,
      context: { table: "email_folder_rules", op: "insert", rule_type: ruleType },
    });
  }
}
