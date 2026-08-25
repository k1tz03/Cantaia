import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOrgAdmin } from "@/lib/admin/require-org-admin";
import {
  aggregateSiteEntries,
  computeProjectFinancials,
  loadRateContext,
  COUNTED_REPORT_STATUSES,
  SITE_ENTRY_COLUMNS,
  roundChf,
} from "@cantaia/core/financials";

/**
 * GET /api/direction/stats
 * Org-wide P&L for the direction dashboard: invoiced, purchases, valued
 * labour/machines and the REAL margin (labour was ignored until now).
 *
 * Restricted to org admins / directors / superadmins: this endpoint publishes
 * per-project margins and hourly productivity — it was readable by every
 * authenticated member, foremen included.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function GET(_request: NextRequest) {
  const check = await requireOrgAdmin();
  if (!check.authorized) {
    return NextResponse.json({ error: check.error }, { status: check.status });
  }

  const orgId = check.profile.organization_id;
  const admin = createAdminClient();

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
        total_labor_cost: 0,
        total_machine_cost: 0,
        total_margin: 0,
        avg_margin_pct: 0,
        avg_margin_pct_simple: 0,
        total_hours: 0,
        total_machine_hours: 0,
        avg_hours_per_thousand: 0,
        project_count: 0,
      },
      top_performers: [],
      hours_efficiency: [],
    });
  }

  const projectIds = projects.map((p: any) => p.id);

  // Only submitted/locked reports are financial facts — unified filter.
  // (This route counted drafts too, so an unsubmitted report silently changed
  // the org margin here but not in /api/projects/[id]/financials.)
  const { data: reports, error: reportsError } = await (admin as any)
    .from("site_reports")
    .select("id, project_id")
    .in("project_id", projectIds)
    .in("status", COUNTED_REPORT_STATUSES as unknown as string[]);

  if (reportsError) {
    console.error("[direction/stats] Reports fetch error:", reportsError.message);
    return NextResponse.json({ error: "Failed to fetch site reports" }, { status: 500 });
  }

  const reportsByProject = new Map<string, string[]>();
  const reportToProject = new Map<string, string>();
  for (const r of reports || []) {
    if (!reportsByProject.has(r.project_id)) reportsByProject.set(r.project_id, []);
    reportsByProject.get(r.project_id)!.push(r.id);
    reportToProject.set(r.id, r.project_id);
  }

  const allReportIds = (reports || []).map((r: any) => r.id);

  // Fetch entries in batches (.in() has a practical limit)
  let allEntries: any[] = [];
  if (allReportIds.length > 0) {
    const BATCH_SIZE = 500;
    for (let i = 0; i < allReportIds.length; i += BATCH_SIZE) {
      const batch = allReportIds.slice(i, i + BATCH_SIZE);
      const { data: entries, error: entriesError } = await (admin as any)
        .from("site_report_entries")
        .select(SITE_ENTRY_COLUMNS)
        .in("report_id", batch);
      if (entriesError) {
        console.error("[direction/stats] Entries fetch error:", entriesError.message);
        return NextResponse.json({ error: "Failed to fetch site report entries" }, { status: 500 });
      }
      if (entries) allEntries = allEntries.concat(entries);
    }
  }

  const rates = await loadRateContext(admin as any, orgId, projectIds);

  // Bucket entries per project, then value each bucket through the core.
  const entriesByProject = new Map<string, any[]>();
  for (const entry of allEntries) {
    const projectId = reportToProject.get(entry.report_id);
    if (!projectId) continue;
    const list = entriesByProject.get(projectId) || [];
    list.push(entry);
    entriesByProject.set(projectId, list);
  }

  let totalInvoiced = 0;
  let totalPurchases = 0;
  let totalLaborCost = 0;
  let totalMachineCost = 0;
  let totalHours = 0;
  let totalMachineHours = 0;
  let marginPctSum = 0;

  const projectResults = projects.map((p: any) => {
    const invoiced = parseFloat(p.invoiced_amount || "0");
    const purchases = parseFloat(p.purchase_costs || "0");
    const aggregates = aggregateSiteEntries(entriesByProject.get(p.id) || [], rates);
    const workers = aggregates.workers instanceof Set ? aggregates.workers.size : aggregates.workers;

    const financials = computeProjectFinancials({
      invoiced,
      purchases,
      laborHours: aggregates.laborHours,
      machineHours: aggregates.machineHours,
      hourlyRate: rates.defaultRate ?? 0,
      machineRate: rates.machineRate,
      laborCost: aggregates.laborCost,
      machineCost: aggregates.machineCost,
    });

    const hoursPerThousand = invoiced > 0 ? (aggregates.laborHours / invoiced) * 1000 : 0;

    totalInvoiced += invoiced;
    totalPurchases += purchases;
    totalLaborCost += financials.laborCost;
    totalMachineCost += financials.machineCost;
    totalHours += aggregates.laborHours;
    totalMachineHours += aggregates.machineHours;
    marginPctSum += financials.marginPct ?? 0;

    return {
      project_id: p.id,
      project_name: p.name,
      status: p.status,
      closed_at: p.closed_at,
      invoiced_amount: invoiced,
      purchase_costs: purchases,
      labor_cost: financials.laborCost,
      machine_cost: financials.machineCost,
      machine_valued: aggregates.machineValued === true,
      margin: financials.margin,
      margin_pct: financials.marginPct ?? 0,
      total_labor_hours: aggregates.laborHours,
      total_machine_hours: aggregates.machineHours,
      total_workers: workers,
      total_delivery_notes: aggregates.deliveryNotes,
      total_reports: (reportsByProject.get(p.id) || []).length,
      hours_per_thousand: roundChf(hoursPerThousand),
    };
  });

  const projectCount = projects.length;
  // Costs now include labour + machines — `total_costs` is the full cost base.
  const totalCosts = totalPurchases + totalLaborCost + totalMachineCost;
  const totalMargin = totalInvoiced - totalCosts;
  // Weighted by invoiced amount: a 90% margin on a CHF 5k job must not offset a
  // 2% margin on a CHF 2M job, which the unweighted mean did.
  const avgMarginPct = totalInvoiced > 0 ? (totalMargin / totalInvoiced) * 100 : 0;
  // Unweighted mean kept for reference (per-project average).
  const avgMarginPctSimple = projectCount > 0 ? marginPctSum / projectCount : 0;
  const avgHoursPerThousand = totalInvoiced > 0 ? (totalHours / totalInvoiced) * 1000 : 0;

  const topPerformers = [...projectResults].sort((a, b) => b.margin_pct - a.margin_pct);

  const hoursEfficiency = [...projectResults]
    .filter((p) => p.hours_per_thousand > 0)
    .sort((a, b) => a.hours_per_thousand - b.hours_per_thousand);

  return NextResponse.json({
    projects: projectResults,
    aggregates: {
      total_invoiced: roundChf(totalInvoiced),
      total_purchases: roundChf(totalPurchases),
      total_labor_cost: roundChf(totalLaborCost),
      total_machine_cost: roundChf(totalMachineCost),
      total_costs: roundChf(totalCosts),
      total_margin: roundChf(totalMargin),
      avg_margin_pct: roundChf(avgMarginPct),
      avg_margin_pct_simple: roundChf(avgMarginPctSimple),
      total_hours: roundChf(totalHours),
      total_machine_hours: roundChf(totalMachineHours),
      avg_hours_per_thousand: roundChf(avgHoursPerThousand),
      hourly_rate: rates.defaultRate ?? null,
      machine_rate: rates.machineRate,
      project_count: projectCount,
    },
    top_performers: topPerformers,
    hours_efficiency: hoursEfficiency,
  });
}
