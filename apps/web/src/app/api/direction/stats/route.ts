import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/direction/stats
 * Returns org-wide financial statistics for the direction dashboard.
 * Only includes projects where invoiced_amount is set (finalized projects).
 */
export async function GET(_request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Get user's organization
  const { data: userRow } = await admin
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!userRow?.organization_id) {
    return NextResponse.json({ error: "No organization" }, { status: 403 });
  }

  const orgId = userRow.organization_id;

  // Get all projects with invoiced_amount set (finalized)
  const { data: projects, error: projError } = await (admin as any)
    .from("projects")
    .select("id, name, invoiced_amount, purchase_costs, closed_at, status")
    .eq("organization_id", orgId)
    .not("invoiced_amount", "is", null);

  if (projError) {
    console.error("[direction/stats] Projects fetch error:", projError.message);
    return NextResponse.json({ error: "Failed to fetch projects" }, { status: 500 });
  }

  if (!projects || projects.length === 0) {
    return NextResponse.json({
      projects: [],
      aggregates: {
        total_invoiced: 0,
        total_costs: 0,
        total_margin: 0,
        avg_margin_pct: 0,
        total_hours: 0,
        avg_hours_per_thousand: 0,
        project_count: 0,
      },
      top_performers: [],
      hours_efficiency: [],
    });
  }

  // Get site reports for all these projects
  const projectIds = projects.map((p: any) => p.id);

  const { data: reports } = await (admin as any)
    .from("site_reports")
    .select("id, project_id")
    .in("project_id", projectIds);

  const reportsByProject = new Map<string, string[]>();
  for (const r of reports || []) {
    if (!reportsByProject.has(r.project_id)) {
      reportsByProject.set(r.project_id, []);
    }
    reportsByProject.get(r.project_id)!.push(r.id);
  }

  // Get all report IDs
  const allReportIds = (reports || []).map((r: any) => r.id);

  // Fetch entries in batches if needed (Supabase .in() has a limit)
  let allEntries: any[] = [];
  if (allReportIds.length > 0) {
    const BATCH_SIZE = 500;
    for (let i = 0; i < allReportIds.length; i += BATCH_SIZE) {
      const batch = allReportIds.slice(i, i + BATCH_SIZE);
      const { data: entries } = await (admin as any)
        .from("site_report_entries")
        .select("report_id, entry_type, duration_hours, crew_member_id")
        .in("report_id", batch);
      if (entries) {
        allEntries = allEntries.concat(entries);
      }
    }
  }

  // Map report_id -> project_id for fast lookup
  const reportToProject = new Map<string, string>();
  for (const r of reports || []) {
    reportToProject.set(r.id, r.project_id);
  }

  // Aggregate entries per project
  const projectStats = new Map<string, {
    labor_hours: number;
    machine_hours: number;
    workers: Set<string>;
    delivery_notes: number;
    report_count: number;
  }>();

  // Initialize stats for all projects
  for (const p of projects) {
    const rIds = reportsByProject.get(p.id) || [];
    projectStats.set(p.id, {
      labor_hours: 0,
      machine_hours: 0,
      workers: new Set(),
      delivery_notes: 0,
      report_count: rIds.length,
    });
  }

  // Distribute entries to projects
  for (const entry of allEntries) {
    const projectId = reportToProject.get(entry.report_id);
    if (!projectId) continue;
    const stats = projectStats.get(projectId);
    if (!stats) continue;

    if (entry.entry_type === "labor") {
      stats.labor_hours += parseFloat(entry.duration_hours || "0");
      if (entry.crew_member_id) {
        stats.workers.add(entry.crew_member_id);
      }
    } else if (entry.entry_type === "machine") {
      stats.machine_hours += parseFloat(entry.duration_hours || "0");
    } else if (entry.entry_type === "delivery_note") {
      stats.delivery_notes += 1;
    }
  }

  // Build per-project results
  let totalInvoiced = 0;
  let totalCosts = 0;
  let totalHours = 0;
  let marginPctSum = 0;

  const projectResults = projects.map((p: any) => {
    const invoiced = parseFloat(p.invoiced_amount || "0");
    const costs = parseFloat(p.purchase_costs || "0");
    const margin = invoiced - costs;
    const marginPct = invoiced > 0 ? (margin / invoiced) * 100 : 0;
    const stats = projectStats.get(p.id)!;
    const laborHours = Math.round(stats.labor_hours * 100) / 100;
    const hoursPerThousand = invoiced > 0 ? (laborHours / invoiced) * 1000 : 0;

    totalInvoiced += invoiced;
    totalCosts += costs;
    totalHours += laborHours;
    marginPctSum += marginPct;

    return {
      project_id: p.id,
      project_name: p.name,
      status: p.status,
      closed_at: p.closed_at,
      invoiced_amount: invoiced,
      purchase_costs: costs,
      margin: Math.round(margin * 100) / 100,
      margin_pct: Math.round(marginPct * 100) / 100,
      total_labor_hours: laborHours,
      total_machine_hours: Math.round(stats.machine_hours * 100) / 100,
      total_workers: stats.workers.size,
      total_delivery_notes: stats.delivery_notes,
      total_reports: stats.report_count,
      hours_per_thousand: Math.round(hoursPerThousand * 100) / 100,
    };
  });

  const projectCount = projects.length;
  const totalMargin = totalInvoiced - totalCosts;
  const avgMarginPct = projectCount > 0 ? marginPctSum / projectCount : 0;
  const avgHoursPerThousand = totalInvoiced > 0 ? (totalHours / totalInvoiced) * 1000 : 0;

  // Top performers by margin %
  const topPerformers = [...projectResults]
    .sort((a, b) => b.margin_pct - a.margin_pct);

  // Hours efficiency (lower is better)
  const hoursEfficiency = [...projectResults]
    .filter((p) => p.hours_per_thousand > 0)
    .sort((a, b) => a.hours_per_thousand - b.hours_per_thousand);

  return NextResponse.json({
    projects: projectResults,
    aggregates: {
      total_invoiced: Math.round(totalInvoiced * 100) / 100,
      total_costs: Math.round(totalCosts * 100) / 100,
      total_margin: Math.round(totalMargin * 100) / 100,
      avg_margin_pct: Math.round(avgMarginPct * 100) / 100,
      total_hours: Math.round(totalHours * 100) / 100,
      avg_hours_per_thousand: Math.round(avgHoursPerThousand * 100) / 100,
      project_count: projectCount,
    },
    top_performers: topPerformers,
    hours_efficiency: hoursEfficiency,
  });
}
