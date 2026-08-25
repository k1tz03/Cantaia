import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * D-FIX7 — the ONE population the decision view can actually render.
 *
 * The badge used to count every `is_processed = false` row while the buckets
 * only rendered three classifications, so emails that no bucket could ever
 * show (classification NULL, `waiting_response`, stray `archived`) inflated a
 * counter the user was unable to bring down: a permanently lying badge.
 *
 * Terminal semantics now:
 *  • action_required / urgent  → "urgent" or "cette semaine" bucket
 *  • info_only / waiting_response → "infos" bucket
 *  • archived + is_processed=false → inconsistent leftover, deliberately out
 *    of every count (the row is terminal, it just predates the fix)
 *  • classification NULL → NOT counted here; reported separately as
 *    `pendingClassification` so the UI can say "en attente de classification"
 *    and offer "Reclassifier" instead of showing an unreachable number.
 */
const BUCKET_CLASSIFICATIONS = [
  "action_required",
  "urgent",
  "info_only",
  "waiting_response",
] as const;

const INFO_CLASSIFICATIONS = ["info_only", "waiting_response"] as const;

/** Counts the exact population the buckets render. */
async function countBucketPopulation(admin: any, userId: string): Promise<number> {
  const { count, error } = await admin
    .from("email_records")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_processed", false)
    .in("classification", BUCKET_CLASSIFICATIONS as unknown as string[]);
  if (error) {
    console.warn("[mail/decisions] bucket count failed:", error.message);
    return 0;
  }
  return count || 0;
}

/** Emails synced but never classified (no AI key, quota hit, or a failed pass). */
async function countPendingClassification(admin: any, userId: string): Promise<number> {
  const { count, error } = await admin
    .from("email_records")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_processed", false)
    .is("classification", null);
  if (error) {
    console.warn("[mail/decisions] pending-classification count failed:", error.message);
    return 0;
  }
  return count || 0;
}

/**
 * GET /api/mail/decisions
 * Returns email_records classified as decisions for the mail decision view.
 * ?counts_only=true — returns only the unprocessed count (lightweight, used by sidebar badge)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();
    const countsOnly = request.nextUrl.searchParams.get("counts_only") === "true";

    // Lightweight path: just return the unprocessed counts for the sidebar badge
    if (countsOnly) {
      const [totalUnprocessed, pendingClassification] = await Promise.all([
        countBucketPopulation(admin, user.id),
        countPendingClassification(admin, user.id),
      ]);
      return NextResponse.json({ totalUnprocessed, pendingClassification });
    }

    const { data: profile } = await (admin as any)
      .from("users")
      .select("first_name, organization_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();

    // Fetch actionable emails (action_required or urgent, not processed)
    const { data: actionEmails } = await (admin as any)
      .from("email_records")
      .select("id, subject, sender_email, sender_name, recipients, body_preview, body_html, body_text, received_at, updated_at, classification, ai_summary, ai_classification_confidence, project_id, is_processed, outlook_message_id, price_extracted, email_category, suggested_project_data, classification_status")
      .eq("user_id", user.id)
      .eq("is_processed", false)
      .in("classification", ["action_required", "urgent"])
      .order("received_at", { ascending: false })
      .limit(100);

    // Fetch info emails (not read/processed).
    // D-FIX7: `waiting_response` belongs to a bucket too — it used to be counted
    // by the badge and rendered by nothing.
    const { data: infoEmails } = await (admin as any)
      .from("email_records")
      .select("id, subject, sender_email, sender_name, recipients, body_preview, body_html, body_text, received_at, classification, ai_summary, project_id, is_processed, outlook_message_id, price_extracted, email_category, suggested_project_data, classification_status")
      .eq("user_id", user.id)
      .eq("is_processed", false)
      .in("classification", INFO_CLASSIFICATIONS as unknown as string[])
      .order("received_at", { ascending: false })
      .limit(50);

    // Get project names for all referenced project_ids
    const projectIds = [
      ...new Set<string>(
        [...(actionEmails || []), ...(infoEmails || [])]
          .map((e: any) => e.project_id)
          .filter(Boolean)
      ),
    ];

    let projectMap: Record<string, string> = {};
    if (projectIds.length > 0) {
      const { data: projects } = await admin
        .from("projects")
        .select("id, name")
        .in("id", projectIds);
      if (projects) {
        for (const p of projects) {
          projectMap[p.id] = p.name;
        }
      }
    }

    // price_indicator is intentionally left null: computing a market-vs-extracted
    // delta requires each email's extracted CFC + unit price, which are not
    // available on email_records here. The previous code fetched 500
    // ingested_offer_lines, built a per-CFC median map, then threw it away by
    // setting every indicator to `undefined` — pure DB cost for no output. The
    // real comparison lives on the submissions/quotes side. Field kept (null) so
    // the frontend contract is unchanged.
    const priceIndicators: Record<string, { extracted_price?: number; market_median?: number; diff_percent?: number }> = {};

    // Classify into urgent / thisWeek / info
    const urgent: any[] = [];
    const thisWeek: any[] = [];

    for (const email of actionEmails || []) {
      const enriched = {
        ...email,
        project_name: email.project_id ? projectMap[email.project_id] || null : null,
        price_indicator: priceIndicators[email.id] || null,
        is_quote: email.price_extracted || email.email_category === "price_response",
      };

      if (
        email.classification === "urgent" ||
        (email.classification === "action_required" && email.received_at < fortyEightHoursAgo)
      ) {
        urgent.push({ ...enriched, priority: "urgent" });
      } else {
        thisWeek.push({ ...enriched, priority: "action" });
      }
    }

    const info = (infoEmails || []).map((email: any) => ({
      ...email,
      project_name: email.project_id ? projectMap[email.project_id] || null : null,
      price_indicator: priceIndicators[email.id] || null,
      is_quote: email.price_extracted || email.email_category === "price_response",
      priority: "info",
    }));

    // Stats
    const { count: processedTodayCount } = await (admin as any)
      .from("email_records")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_processed", true)
      .gte("updated_at", todayStart);

    // D-FIX7 — same population as the buckets, plus the orphan bucket exposed
    // under its own name instead of being folded into a number nobody can act on.
    const [totalUnprocessedCount, pendingClassificationCount] = await Promise.all([
      countBucketPopulation(admin, user.id),
      countPendingClassification(admin, user.id),
    ]);

    // Average response time (processed emails from last 7 days)
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recentProcessed } = await (admin as any)
      .from("email_records")
      .select("received_at, updated_at")
      .eq("user_id", user.id)
      .eq("is_processed", true)
      .gte("updated_at", sevenDaysAgo)
      .limit(200);

    let avgResponseTimeHours = 0;
    if (recentProcessed && recentProcessed.length > 0) {
      const totalMs = recentProcessed.reduce((sum: number, e: any) => {
        const received = new Date(e.received_at).getTime();
        const processed = new Date(e.updated_at).getTime();
        return sum + Math.max(0, processed - received);
      }, 0);
      avgResponseTimeHours = Math.round((totalMs / recentProcessed.length / (1000 * 60 * 60)) * 10) / 10;
    }

    // Savings generated — count won visits revenue (visits with status "won" and budget in report)
    let savingsGenerated: number | null = null;
    try {
      const { data: wonVisits } = await (admin as any)
        .from("client_visits")
        .select("report")
        .eq("organization_id", profile.organization_id)
        .eq("status", "won");

      if (wonVisits && wonVisits.length > 0) {
        savingsGenerated = wonVisits.reduce((sum: number, v: any) => {
          return sum + (v.report?.budget?.range_min || 0);
        }, 0);
      }
    } catch {
      // Table might not exist
    }

    // Also check awarded submissions
    try {
      const { data: awardedSubs } = await (admin as any)
        .from("submissions")
        .select("budget_estimate")
        .eq("organization_id", profile.organization_id)
        .eq("status", "awarded");

      if (awardedSubs && awardedSubs.length > 0) {
        if (savingsGenerated === null) savingsGenerated = 0;
        for (const sub of awardedSubs) {
          if (sub.budget_estimate?.total_median) {
            savingsGenerated += sub.budget_estimate.total_median;
          }
        }
      }
    } catch {
      // Table might not exist
    }

    // Fetch all org projects for reassignment dropdown
    const { data: orgProjects } = await (admin as any)
      .from("projects")
      .select("id, name, code, color")
      .eq("organization_id", profile.organization_id)
      .in("status", ["active", "planning"])
      .order("name");

    // Check if user is alone in org + get org members for delegation
    const { data: orgMembers } = await (admin as any)
      .from("users")
      .select("id, first_name, last_name, email")
      .eq("organization_id", profile.organization_id)
      .neq("id", user.id);

    const isAloneInOrg = !orgMembers || orgMembers.length === 0;

    // Check if user has an active email connection (needed for "Connect email" banner)
    let hasEmailConnection = false;
    try {
      const { data: conn } = await (admin as any)
        .from("email_connections")
        .select("id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .limit(1)
        .maybeSingle();
      hasEmailConnection = !!conn;
      // Fallback: check legacy microsoft_access_token
      if (!hasEmailConnection) {
        const { data: legacyUser } = await (admin as any)
          .from("users")
          .select("microsoft_access_token")
          .eq("id", user.id)
          .maybeSingle();
        hasEmailConnection = !!legacyUser?.microsoft_access_token;
      }
    } catch { /* table may not exist */ }

    return NextResponse.json({
      success: true,
      firstName: profile.first_name || "Utilisateur",
      hasEmailConnection,
      isAloneInOrg,
      orgMembers: orgMembers || [],
      orgProjects: orgProjects || [],
      urgent,
      thisWeek,
      info,
      stats: {
        avgResponseTime: avgResponseTimeHours,
        processedToday: processedTodayCount || 0,
        totalUnprocessed: totalUnprocessedCount,
        pendingClassification: pendingClassificationCount,
        totalToday: (processedTodayCount || 0) + totalUnprocessedCount,
        savingsGenerated,
        decisionsToday: processedTodayCount || 0,
        decisionsUrgent: urgent.length,
        decisionsThisWeek: thisWeek.length,
        decisionsInfo: info.length,
      },
    });
  } catch (err: any) {
    console.error("[mail/decisions] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * PATCH /api/mail/decisions
 * Mark an email as processed (decision taken).
 * Body: { email_id: string, action: string }
 */
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();

    const body = await request.json();
    const { email_id, action } = body;

    if (!email_id) {
      return NextResponse.json({ error: "email_id required" }, { status: 400 });
    }

    const updates: Record<string, any> = {
      is_processed: true,
      updated_at: new Date().toISOString(),
    };

    if (action === "archive") {
      updates.classification = "archived";
    }
    const PROCESS_ACTIONS: Record<string, string> = {
      task: "task_created",
      replied: "replied",
      delegated: "delegated",
      accept: "accepted",
      refuse: "refused",
    };
    if (PROCESS_ACTIONS[action]) {
      updates.process_action = PROCESS_ACTIONS[action];
    }

    // The write result used to be discarded: a failed dismissal returned
    // `success: true` while the card came back on the next fetch.
    const { error: updateErr } = await (admin as any)
      .from("email_records")
      .update(updates)
      .eq("id", email_id)
      .eq("user_id", user.id);

    if (updateErr) {
      console.error("[mail/decisions] PATCH update failed:", updateErr.message);
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[mail/decisions] PATCH error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
