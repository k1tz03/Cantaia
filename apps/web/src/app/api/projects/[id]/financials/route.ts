import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOrgAdmin } from "@/lib/admin/require-org-admin";
import { parseBody } from "@/lib/api/parse-body";
import {
  aggregateSiteEntries,
  computeProjectFinancials,
  loadRateContext,
  COUNTED_REPORT_STATUSES,
  SITE_ENTRY_COLUMNS,
  roundChf,
} from "@cantaia/core/financials";

/**
 * GET /api/projects/[id]/financials
 * Project P&L: invoiced, purchases, valued labour/machines, real margin.
 *
 * Margin = invoiced − purchases − laborCost − machineCost (core/financials).
 * Only `submitted`/`locked` reports are counted — drafts are field notes, not
 * financial facts (this route used to count every report, including drafts).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!id) {
    return NextResponse.json({ error: "Missing project ID" }, { status: 400 });
  }

  // Project P&L (marges, montants facturés, coûts d'achat) = donnée financière
  // sensible : lecture réservée aux admin/director/superadmin (requireOrgAdmin),
  // pas à tout membre de l'org.
  const auth = await requireOrgAdmin();
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const userRow = { organization_id: auth.profile.organization_id };

  const admin = createAdminClient();

  // Verify project belongs to user's org and get financial fields
  const { data: project, error: projError } = await (admin as any)
    .from("projects")
    .select("id, name, invoiced_amount, purchase_costs, closed_at")
    .eq("id", id)
    .eq("organization_id", userRow.organization_id)
    .maybeSingle();

  if (projError) {
    console.error("[financials] Project fetch error:", projError.message);
    return NextResponse.json({ error: "Failed to fetch project" }, { status: 500 });
  }

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Only submitted/locked reports count (unified filter — see core/financials).
  const { data: reports, error: reportsError } = await (admin as any)
    .from("site_reports")
    .select("id")
    .eq("project_id", id)
    .in("status", COUNTED_REPORT_STATUSES as unknown as string[]);

  if (reportsError) {
    console.error("[financials] Reports fetch error:", reportsError.message);
    return NextResponse.json({ error: "Failed to fetch site reports" }, { status: 500 });
  }

  const reportIds = (reports || []).map((r: any) => r.id);
  const totalReports = reportIds.length;

  let entries: any[] = [];
  if (reportIds.length > 0) {
    const { data: rows, error: entriesError } = await (admin as any)
      .from("site_report_entries")
      .select(SITE_ENTRY_COLUMNS)
      .in("report_id", reportIds);

    if (entriesError) {
      console.error("[financials] Entries fetch error:", entriesError.message);
      return NextResponse.json({ error: "Failed to fetch site report entries" }, { status: 500 });
    }
    entries = rows || [];
  }

  const rates = await loadRateContext(admin as any, userRow.organization_id, [id]);
  const aggregates = aggregateSiteEntries(entries, rates);
  const totalWorkers = aggregates.workers instanceof Set ? aggregates.workers.size : aggregates.workers;

  const invoicedAmount = parseFloat(project.invoiced_amount || "0");
  const purchaseCosts = parseFloat(project.purchase_costs || "0");

  const financials = computeProjectFinancials({
    invoiced: invoicedAmount,
    purchases: purchaseCosts,
    laborHours: aggregates.laborHours,
    machineHours: aggregates.machineHours,
    hourlyRate: rates.defaultRate ?? 0,
    machineRate: rates.machineRate,
    laborCost: aggregates.laborCost,
    machineCost: aggregates.machineCost,
  });

  const costPerHour = aggregates.laborHours > 0 ? invoicedAmount / aggregates.laborHours : 0;
  const hoursPerThousand = invoicedAmount > 0 ? (aggregates.laborHours / invoicedAmount) * 1000 : 0;

  // ── Planning variance (planned vs actual days per CFC) ──────────────────────
  // Still empty: it needs `site_report_entries.cfc_code` / `planning_task_id`
  // (migration 093). Once the field entries carry a CFC, group the valued lines
  // by cfc_code and compare against planning_tasks.duration_days.
  const planningVariance: Array<{
    cfc_code: string;
    planned_days: number;
    actual_days: number;
    variance_pct: number;
  }> = [];

  return NextResponse.json({
    project_id: id,
    project_name: project.name,
    invoiced_amount: project.invoiced_amount ? invoicedAmount : null,
    purchase_costs: project.purchase_costs ? purchaseCosts : null,
    closed_at: project.closed_at,
    total_labor_hours: aggregates.laborHours,
    total_machine_hours: aggregates.machineHours,
    total_workers: totalWorkers,
    total_delivery_notes: aggregates.deliveryNotes,
    total_reports: totalReports,
    // Valued labour/machines — the margin now subtracts them.
    hourly_rate: rates.defaultRate ?? null,
    machine_rate: rates.machineRate,
    machine_valued: aggregates.machineValued === true,
    labor_cost: financials.laborCost,
    machine_cost: financials.machineCost,
    margin: financials.margin,
    margin_pct: financials.marginPct,
    cost_per_hour: roundChf(costPerHour),
    hours_per_thousand: roundChf(hoursPerThousand),
    planning_variance: planningVariance,
  });
}

/**
 * POST /api/projects/[id]/financials
 * Update financial fields on a project (invoiced_amount, purchase_costs, closed_at).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!id) {
    return NextResponse.json({ error: "Missing project ID" }, { status: 400 });
  }

  // Écriture des champs financiers = réservée aux admin/director/superadmin.
  const auth = await requireOrgAdmin();
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const userRow = { organization_id: auth.profile.organization_id };

  const admin = createAdminClient();

  // Verify project belongs to user's org
  const { data: existing } = await admin
    .from("projects")
    .select("id")
    .eq("id", id)
    .eq("organization_id", userRow.organization_id)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const { data: body, error: parseError } = await parseBody(request);
  if (parseError || !body) {
    return NextResponse.json({ error: parseError || "Invalid request" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};

  if ("invoiced_amount" in body) {
    const val = parseFloat(body.invoiced_amount);
    if (isNaN(val) || val < 0) {
      return NextResponse.json({ error: "invoiced_amount must be a positive number" }, { status: 400 });
    }
    updates.invoiced_amount = val;
  }

  if ("purchase_costs" in body) {
    const val = parseFloat(body.purchase_costs);
    if (isNaN(val) || val < 0) {
      return NextResponse.json({ error: "purchase_costs must be a positive number" }, { status: 400 });
    }
    updates.purchase_costs = val;
  }

  if ("closed_at" in body) {
    updates.closed_at = body.closed_at;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { data: project, error } = await (admin as any)
    .from("projects")
    .update(updates)
    .eq("id", id)
    .select("id, name, invoiced_amount, purchase_costs, closed_at")
    .single();

  if (error) {
    console.error("[financials] Update error:", error.message);
    return NextResponse.json({ error: "Failed to update project" }, { status: 500 });
  }

  return NextResponse.json({ project });
}
