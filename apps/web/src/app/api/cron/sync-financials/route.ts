import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 120;

/**
 * POST /api/cron/sync-financials
 * Syncs site report data into project financial metadata for all active portal-enabled projects.
 * Aggregates labor hours, machine hours, delivery notes, and worker counts.
 * Protected by CRON_SECRET.
 * Scheduled: daily at 4:00 AM.
 */
export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const results: Array<{ project_id: string; project_name: string; updated: boolean; error?: string }> = [];

  try {
    // Get all active projects with portal enabled
    const { data: projects } = await (admin as any)
      .from("projects")
      .select("id, name, organization_id")
      .eq("portal_enabled", true)
      .in("status", ["active", "planning"]);

    if (!projects || projects.length === 0) {
      return NextResponse.json({ message: "No portal-enabled projects found", count: 0 });
    }

    console.log(`[cron/sync-financials] Processing ${projects.length} portal-enabled projects`);

    for (const project of projects) {
      try {
        // Get all site reports for this project
        const { data: reports } = await (admin as any)
          .from("site_reports")
          .select("id")
          .eq("project_id", project.id);

        const reportIds = (reports || []).map((r: any) => r.id);

        let totalLaborHours = 0;
        let totalMachineHours = 0;
        let totalDeliveryNotes = 0;
        let uniqueWorkers = 0;

        if (reportIds.length > 0) {
          // Get all entries for these reports
          const { data: entries } = await (admin as any)
            .from("site_report_entries")
            .select("entry_type, duration_hours, crew_member_id")
            .in("report_id", reportIds);

          if (entries && entries.length > 0) {
            const workerIds = new Set<string>();

            for (const entry of entries) {
              if (entry.entry_type === "labor") {
                totalLaborHours += parseFloat(entry.duration_hours || "0");
                if (entry.crew_member_id) {
                  workerIds.add(entry.crew_member_id);
                }
              } else if (entry.entry_type === "machine") {
                totalMachineHours += parseFloat(entry.duration_hours || "0");
              } else if (entry.entry_type === "delivery_note") {
                totalDeliveryNotes += 1;
              }
            }

            uniqueWorkers = workerIds.size;
          }
        }

        // Store aggregated data in intelligence_metadata JSONB field
        const metadata = {
          site_reports_sync: {
            total_labor_hours: Math.round(totalLaborHours * 100) / 100,
            total_machine_hours: Math.round(totalMachineHours * 100) / 100,
            total_delivery_notes: totalDeliveryNotes,
            unique_workers: uniqueWorkers,
            total_reports: reportIds.length,
            synced_at: new Date().toISOString(),
          },
        };

        const { error: updateErr } = await (admin as any)
          .from("projects")
          .update({ intelligence_metadata: metadata })
          .eq("id", project.id);

        if (updateErr) {
          console.warn(`[cron/sync-financials] Failed to update project ${project.id}:`, updateErr.message);
          results.push({ project_id: project.id, project_name: project.name, updated: false, error: updateErr.message });
        } else {
          results.push({ project_id: project.id, project_name: project.name, updated: true });
        }
      } catch (err: any) {
        console.error(`[cron/sync-financials] Error processing project ${project.id}:`, err);
        results.push({ project_id: project.id, project_name: project.name, updated: false, error: err.message });
      }
    }

    const updated = results.filter((r) => r.updated).length;
    const failed = results.filter((r) => !r.updated).length;

    console.log(`[cron/sync-financials] Done: ${updated} updated, ${failed} failed out of ${projects.length} projects`);

    return NextResponse.json({
      message: `Synced ${updated} projects`,
      total: projects.length,
      updated,
      failed,
      results,
    });
  } catch (err: any) {
    console.error("[cron/sync-financials] Fatal error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
