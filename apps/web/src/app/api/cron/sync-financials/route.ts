import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { notifyUser } from "@cantaia/core/notifications";

export const maxDuration = 120;

/** Vercel Cron invokes scheduled paths with GET — delegate to POST. */
export async function GET(request: NextRequest) {
  return POST(request);
}

// ── What this cron used to do, and why it no longer does it ──────────────────
// It re-aggregated every portal project's hours and wrote them into
// `projects.intelligence_metadata.site_reports_sync`. Nothing in the product
// ever read that JSONB: /api/projects/[id]/financials and /api/direction/stats
// both recompute from `site_report_entries` on every request. Worse, the write
// REPLACED the whole `intelligence_metadata` object (clobbering any other
// producer) and it skipped closed projects — precisely the ones whose margin
// matters. It was a nightly write-only job.
//
// Rather than cache numbers that are already cheap to compute, the slot now
// does something the product actually lacked: it chases the reports that never
// got submitted. A draft is invisible to the whole financial chain (only
// `submitted`/`locked` count — see @cantaia/core/financials), so a foreman who
// saved and walked away silently removes a day of labour from the margin.
//
// Anti-spam without a new column: a draft is alerted once, on the single daily
// run where its `updated_at` sits in the 48h–72h window. No `last_alerted_at`
// state, no repeated nagging, no migration outside the 093 contract.

const STALE_AFTER_HOURS = 48;
const ALERT_WINDOW_HOURS = 72;

interface StaleDraft {
  id: string;
  project_id: string;
  report_date: string | null;
  submitted_by_name: string | null;
  updated_at: string | null;
}

/**
 * POST /api/cron/sync-financials
 * Alerts project owners about site reports left in `draft` for more than 48h.
 * Protected by CRON_SECRET. Scheduled: daily at 4:00 AM.
 */
export async function POST(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  try {
    const now = Date.now();
    const staleBefore = new Date(now - STALE_AFTER_HOURS * 3600_000).toISOString();
    const windowStart = new Date(now - ALERT_WINDOW_HOURS * 3600_000).toISOString();

    const { data: drafts, error: draftsError } = await (admin as any)
      .from("site_reports")
      .select("id, project_id, report_date, submitted_by_name, updated_at")
      .eq("status", "draft")
      .lt("updated_at", staleBefore)
      .gte("updated_at", windowStart)
      .order("updated_at", { ascending: true })
      .limit(500);

    if (draftsError) {
      console.error("[cron/sync-financials] Drafts query failed:", draftsError.message);
      return NextResponse.json({ error: draftsError.message }, { status: 500 });
    }

    const staleDrafts = (drafts || []) as StaleDraft[];
    if (staleDrafts.length === 0) {
      return NextResponse.json({ message: "No stale drafts", drafts: 0, notified: 0 });
    }

    // Group drafts per project
    const byProject = new Map<string, StaleDraft[]>();
    for (const draft of staleDrafts) {
      if (!draft.project_id) continue;
      const list = byProject.get(draft.project_id) || [];
      list.push(draft);
      byProject.set(draft.project_id, list);
    }

    const projectIds = Array.from(byProject.keys());
    const { data: projects, error: projectsError } = await (admin as any)
      .from("projects")
      .select("id, name, organization_id, created_by")
      .in("id", projectIds);

    if (projectsError) {
      console.error("[cron/sync-financials] Projects query failed:", projectsError.message);
      return NextResponse.json({ error: projectsError.message }, { status: 500 });
    }

    // Fallback recipient per org: first admin/director (a project without
    // `created_by` must not swallow the alert).
    const orgIds = Array.from(
      new Set<string>((projects || []).map((p: any) => p.organization_id).filter(Boolean)),
    );
    const orgFallback = new Map<string, string>();
    if (orgIds.length > 0) {
      const { data: admins, error: adminsError } = await (admin as any)
        .from("users")
        .select("id, organization_id, role")
        .in("organization_id", orgIds)
        .in("role", ["admin", "director"]);

      if (adminsError) {
        console.warn("[cron/sync-financials] Org admins lookup failed:", adminsError.message);
      }
      for (const row of admins || []) {
        if (row.organization_id && !orgFallback.has(row.organization_id)) {
          orgFallback.set(row.organization_id, row.id);
        }
      }
    }

    const results: Array<{ project_id: string; drafts: number; notified: boolean }> = [];

    for (const project of projects || []) {
      const list = byProject.get(project.id) || [];
      if (list.length === 0) continue;

      const recipientId = project.created_by || orgFallback.get(project.organization_id) || null;
      if (!recipientId) {
        console.warn(`[cron/sync-financials] No recipient for project ${project.id}`);
        results.push({ project_id: project.id, drafts: list.length, notified: false });
        continue;
      }

      const dates = list
        .map((d) => d.report_date)
        .filter(Boolean)
        .slice(0, 5)
        .join(", ");

      const sent = await notifyUser(admin as any, {
        userId: recipientId,
        event: "report_submitted",
        subject: `Rapports de chantier en attente — ${project.name}`,
        title: "Rapports de chantier non soumis",
        body:
          `${list.length} rapport(s) du chantier « ${project.name} » sont en brouillon ` +
          `depuis plus de ${STALE_AFTER_HOURS} h${dates ? ` (${dates})` : ""}. ` +
          `Tant qu'ils ne sont pas soumis, leurs heures ne comptent ni dans la marge, ` +
          `ni dans les exports paie.`,
        ctaLabel: "Voir les rapports",
        ctaPath: `/projects/${project.id}?tab=site-reports`,
      });

      results.push({ project_id: project.id, drafts: list.length, notified: sent });
    }

    const notified = results.filter((r) => r.notified).length;
    console.log(
      `[cron/sync-financials] ${staleDrafts.length} stale drafts across ${results.length} projects, ${notified} owners notified`,
    );

    return NextResponse.json({
      message: `${notified} owner(s) notified`,
      drafts: staleDrafts.length,
      projects: results.length,
      notified,
      results,
    });
  } catch (err: any) {
    console.error("[cron/sync-financials] Fatal error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
