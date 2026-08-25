import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { gateFolderSuggestion, type FolderSuggestionCandidate } from "@cantaia/core/emails";
import { logLearningEvent } from "@cantaia/core/learning";

/**
 * POST /api/email/suggest-folder
 * Suggests the best Outlook folder for an email based on learned patterns
 * AND the email's assigned project context.
 *
 * Body: { sender_email, subject, body_preview, project_id?, project_name?, folders: { id, name }[] }
 * Returns: { suggestion: { folder_id, folder_name, confidence, reason } | null }
 *
 * Scoring tiers:
 *  0. Project name match → folder name contains project name (highest priority, 200pts)
 *  1. Exact sender_email match → 100pts × confidence
 *  2. Sender domain match → 70pts × confidence
 *  3. Subject keyword match → 50pts × confidence
 *  4. Body keyword match → 30pts × confidence
 *
 * When an email is assigned to a project, the folder that matches the project
 * name will always win over generic org-wide rules.
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
    const { sender_email, subject, body_preview, project_id, project_name, folders } = body;

    if (!sender_email || !folders || folders.length === 0) {
      return NextResponse.json({ suggestion: null });
    }

    // Build a folder lookup from provided folders
    const folderMap = new Map<string, string>();
    for (const f of folders) {
      folderMap.set(f.id, f.name);
    }

    // AUDIT 08/2026 — chaque candidat porte le plafond de son tier : la
    // normalisation + le seuil (≥0.6 sinon pas de suggestion) sont appliqués
    // par gateFolderSuggestion (@cantaia/core/emails), testé unitairement.
    const candidates: FolderSuggestionCandidate[] = [];

    // ── Tier 0: Project name matching ──────────────────────────
    // When the email is assigned to a project, find the folder whose name
    // best matches the project name. This should be the strongest signal.
    if (project_name) {
      const projectNameLower = project_name.toLowerCase().trim();
      // Also try to match project name from DB if project_id is provided
      let dbProjectName: string | null = null;
      if (project_id) {
        // Anti-IDOR / oracle cross-tenant : le service role bypasse la RLS, donc
        // le lookup DOIT être scopé à l'org du caller — sinon un project_id
        // arbitraire révèle le nom d'un projet d'une autre organisation.
        const { data: proj } = await (admin as any)
          .from("projects")
          .select("name")
          .eq("id", project_id)
          .eq("organization_id", profile.organization_id)
          .maybeSingle();
        if (proj?.name) dbProjectName = proj.name.toLowerCase().trim();
      }

      for (const [folderId, folderName] of folderMap.entries()) {
        const folderLower = folderName.toLowerCase();
        // Check if folder name contains project name or vice versa
        const nameToCheck = dbProjectName || projectNameLower;
        if (
          folderLower.includes(nameToCheck) ||
          nameToCheck.includes(folderLower) ||
          fuzzyProjectMatch(folderLower, nameToCheck)
        ) {
          candidates.push({
            folder_id: folderId,
            folder_name: folderName,
            score: 200, // Always wins over rule-based suggestions
            tier_max: 200,
            decision_source: "project_match",
            reason: `Projet "${project_name}" → ${folderName}`,
          });
        }
      }
    }

    // ── Tiers 1-4: Learned rules (org-wide) ────────────────────
    const { data: rules } = await (admin as any)
      .from("email_folder_rules")
      .select("*")
      .eq("organization_id", profile.organization_id)
      .eq("is_active", true)
      .order("times_confirmed", { ascending: false });

    if (rules && rules.length > 0) {
      const senderDomain = sender_email.split("@")[1]?.toLowerCase() || "";
      const subjectLower = (subject || "").toLowerCase();
      const bodyLower = (body_preview || "").toLowerCase();

      for (const rule of rules) {
        if (!folderMap.has(rule.folder_id)) continue;
        const folderName = folderMap.get(rule.folder_id)!;
        const confidence = rule.times_confirmed / Math.max(1, rule.times_confirmed + rule.times_overridden);

        // If a project is assigned, boost rules that point to the same project folder
        const projectBoost = project_name && folderName.toLowerCase().includes(project_name.toLowerCase().trim()) ? 1.5 : 1.0;

        if (rule.rule_type === "sender_email" && rule.rule_value.toLowerCase() === sender_email.toLowerCase()) {
          candidates.push({
            folder_id: rule.folder_id,
            folder_name: folderName,
            score: 100 * confidence * projectBoost,
            tier_max: 100,
            decision_source: "sender_email",
            reason: `Expéditeur ${sender_email} → ${folderName}`,
          });
        } else if (rule.rule_type === "sender_domain" && rule.rule_value.toLowerCase() === senderDomain) {
          candidates.push({
            folder_id: rule.folder_id,
            folder_name: folderName,
            score: 70 * confidence * projectBoost,
            tier_max: 70,
            decision_source: "sender_domain",
            reason: `Domaine @${senderDomain} → ${folderName}`,
          });
        } else if (rule.rule_type === "subject_keyword" && subjectLower.includes(rule.rule_value.toLowerCase())) {
          candidates.push({
            folder_id: rule.folder_id,
            folder_name: folderName,
            score: 50 * confidence * projectBoost,
            tier_max: 50,
            decision_source: "subject_keyword",
            reason: `Sujet contient "${rule.rule_value}" → ${folderName}`,
          });
        } else if (rule.rule_type === "body_keyword" && bodyLower.includes(rule.rule_value.toLowerCase())) {
          candidates.push({
            folder_id: rule.folder_id,
            folder_name: folderName,
            score: 30 * confidence * projectBoost,
            tier_max: 30,
            decision_source: "body_keyword",
            reason: `Corps contient "${rule.rule_value}" → ${folderName}`,
          });
        }
      }
    }

    // Gate : normalisation par tier + seuil ≥0.6, sinon pas de suggestion.
    const suggestion = gateFolderSuggestion(candidates);

    if (!suggestion) {
      return NextResponse.json({ suggestion: null });
    }

    // Journal d'apprentissage : suggestion montrée → l'accept-rate devient
    // mesurable (le pendant accepted/rejected est loggé par /api/email/folder-learn).
    await logLearningEvent(admin, {
      organizationId: profile.organization_id,
      module: "mail_folders",
      eventType: "suggestion_shown",
      decisionSource: suggestion.decision_source,
      payload: {
        folder_id: suggestion.folder_id,
        confidence: suggestion.confidence,
      },
    });

    return NextResponse.json({
      suggestion: {
        folder_id: suggestion.folder_id,
        folder_name: suggestion.folder_name,
        confidence: suggestion.confidence,
        reason: suggestion.reason,
      },
    });
  } catch (err) {
    console.error("[suggest-folder] Error:", err);
    return NextResponse.json({ suggestion: null });
  }
}

/**
 * Fuzzy match between a folder name and a project name.
 * Handles cases like folder="Central Malley" and project="Chantier Central Malley"
 * or folder="Edifea - Les Cèdres" and project="Les Cèdres".
 */
function fuzzyProjectMatch(folderName: string, projectName: string): boolean {
  // Extract significant words (3+ chars, skip noise)
  const noise = new Set(["les", "des", "une", "pour", "par", "avec", "dans", "sur", "chantier", "projet"]);
  const extractWords = (s: string) =>
    s.split(/[\s\-_,./]+/)
      .map((w) => w.toLowerCase())
      .filter((w) => w.length >= 3 && !noise.has(w));

  const folderWords = extractWords(folderName);
  const projectWords = extractWords(projectName);

  if (folderWords.length === 0 || projectWords.length === 0) return false;

  // Count how many project words appear in the folder name (or vice versa)
  const matchCount = projectWords.filter((pw) =>
    folderWords.some((fw) => fw.includes(pw) || pw.includes(fw))
  ).length;

  // At least 50% of the meaningful words must match
  return matchCount >= Math.max(1, Math.ceil(Math.min(folderWords.length, projectWords.length) * 0.5));
}
