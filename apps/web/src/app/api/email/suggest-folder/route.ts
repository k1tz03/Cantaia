import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/email/suggest-folder
 * Suggests the best Outlook folder for an email based on learned patterns.
 *
 * Body: { sender_email, subject, body_preview, folders: { id, name }[] }
 * Returns: { suggestion: { folder_id, folder_name, confidence, reason } | null }
 *
 * Learning tiers:
 *  1. Exact sender_email match → highest confidence
 *  2. Sender domain match → medium confidence
 *  3. Subject keyword match → medium confidence
 *  4. Body keyword match → lower confidence
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
      return NextResponse.json({ suggestion: null });
    }

    const body = await request.json();
    const { sender_email, subject, body_preview, folders } = body;

    if (!sender_email || !folders || folders.length === 0) {
      return NextResponse.json({ suggestion: null });
    }

    // Fetch learned folder rules for this org
    const { data: rules } = await (admin as any)
      .from("email_folder_rules")
      .select("*")
      .eq("organization_id", profile.organization_id)
      .eq("is_active", true)
      .order("times_confirmed", { ascending: false });

    if (!rules || rules.length === 0) {
      return NextResponse.json({ suggestion: null });
    }

    // Build a folder lookup from provided folders
    const folderMap = new Map<string, string>();
    for (const f of folders) {
      folderMap.set(f.id, f.name);
    }

    type ScoredSuggestion = { folder_id: string; folder_name: string; score: number; reason: string };
    const candidates: ScoredSuggestion[] = [];

    const senderDomain = sender_email.split("@")[1]?.toLowerCase() || "";
    const subjectLower = (subject || "").toLowerCase();
    const bodyLower = (body_preview || "").toLowerCase();

    for (const rule of rules) {
      // Only suggest folders that exist in the current folder list
      if (!folderMap.has(rule.folder_id)) continue;

      const folderName = folderMap.get(rule.folder_id)!;
      const confidence = rule.times_confirmed / Math.max(1, rule.times_confirmed + rule.times_overridden);

      if (rule.rule_type === "sender_email" && rule.rule_value.toLowerCase() === sender_email.toLowerCase()) {
        candidates.push({
          folder_id: rule.folder_id,
          folder_name: folderName,
          score: 100 * confidence,
          reason: `Expéditeur ${sender_email} → ${folderName}`,
        });
      } else if (rule.rule_type === "sender_domain" && rule.rule_value.toLowerCase() === senderDomain) {
        candidates.push({
          folder_id: rule.folder_id,
          folder_name: folderName,
          score: 70 * confidence,
          reason: `Domaine @${senderDomain} → ${folderName}`,
        });
      } else if (rule.rule_type === "subject_keyword" && subjectLower.includes(rule.rule_value.toLowerCase())) {
        candidates.push({
          folder_id: rule.folder_id,
          folder_name: folderName,
          score: 50 * confidence,
          reason: `Sujet contient "${rule.rule_value}" → ${folderName}`,
        });
      } else if (rule.rule_type === "body_keyword" && bodyLower.includes(rule.rule_value.toLowerCase())) {
        candidates.push({
          folder_id: rule.folder_id,
          folder_name: folderName,
          score: 30 * confidence,
          reason: `Corps contient "${rule.rule_value}" → ${folderName}`,
        });
      }
    }

    if (candidates.length === 0) {
      return NextResponse.json({ suggestion: null });
    }

    // Return the highest-scoring suggestion
    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];

    return NextResponse.json({
      suggestion: {
        folder_id: best.folder_id,
        folder_name: best.folder_name,
        confidence: Math.min(0.99, best.score / 100),
        reason: best.reason,
      },
    });
  } catch (err) {
    console.error("[suggest-folder] Error:", err);
    return NextResponse.json({ suggestion: null });
  }
}
