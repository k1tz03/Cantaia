import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/email/folder-learn
 * Records that a user moved an email to a specific folder.
 * Creates/updates rules for sender_email, sender_domain, and subject keywords.
 *
 * Body: { email_id, folder_id, folder_name, sender_email, subject }
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
    const { folder_id, sender_email, subject } = body;

    if (!folder_id || !sender_email) {
      return NextResponse.json({ error: "folder_id and sender_email required" }, { status: 400 });
    }

    const orgId = profile.organization_id;

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

async function upsertRule(
  admin: any,
  orgId: string,
  ruleType: string,
  ruleValue: string,
  folderId: string,
) {
  // Check if rule exists for this org + type + value
  const { data: existing } = await (admin as any)
    .from("email_folder_rules")
    .select("id, folder_id, times_confirmed, times_overridden")
    .eq("organization_id", orgId)
    .eq("rule_type", ruleType)
    .eq("rule_value", ruleValue)
    .maybeSingle();

  if (existing) {
    if (existing.folder_id === folderId) {
      // Same folder → confirm the rule
      await (admin as any)
        .from("email_folder_rules")
        .update({
          times_confirmed: (existing.times_confirmed || 0) + 1,
          is_active: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
    } else {
      // Different folder → override: increment override on old rule, create/confirm new
      await (admin as any)
        .from("email_folder_rules")
        .update({
          times_overridden: (existing.times_overridden || 0) + 1,
          is_active: (existing.times_confirmed || 0) > (existing.times_overridden || 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);

      // Create or confirm the new folder rule
      const { data: newRule } = await (admin as any)
        .from("email_folder_rules")
        .select("id, times_confirmed")
        .eq("organization_id", orgId)
        .eq("rule_type", ruleType)
        .eq("rule_value", ruleValue)
        .eq("folder_id", folderId)
        .maybeSingle();

      if (newRule) {
        await (admin as any)
          .from("email_folder_rules")
          .update({
            times_confirmed: (newRule.times_confirmed || 0) + 1,
            is_active: true,
            updated_at: new Date().toISOString(),
          })
          .eq("id", newRule.id);
      } else {
        await (admin as any)
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
      }
    }
  } else {
    // New rule
    await (admin as any)
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
  }
}
