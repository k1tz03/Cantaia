import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseBody } from "@/lib/api/parse-body";

/**
 * GET /api/projects/[id]/financials
 * Returns project financial summary: invoiced amount, purchase costs,
 * labor/machine hours, workers, delivery notes, reports, and calculated margins.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!id) {
    return NextResponse.json({ error: "Missing project ID" }, { status: 400 });
  }

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

  // Get all site reports for this project
  const { data: reports } = await (admin as any)
    .from("site_reports")
    .select("id")
    .eq("project_id", id);

  const reportIds = (reports || []).map((r: any) => r.id);
  const totalReports = reportIds.length;

  let totalLaborHours = 0;
  let totalMachineHours = 0;
  let totalWorkers = 0;
  let totalDeliveryNotes = 0;

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

      totalWorkers = workerIds.size;
    }
  }

  // Calculate derived values
  const invoicedAmount = parseFloat(project.invoiced_amount || "0");
  const purchaseCosts = parseFloat(project.purchase_costs || "0");
  const margin = invoicedAmount - purchaseCosts;
  const marginPct = invoicedAmount > 0 ? (margin / invoicedAmount) * 100 : 0;
  const costPerHour = totalLaborHours > 0 ? invoicedAmount / totalLaborHours : 0;
  const hoursPerThousand = invoicedAmount > 0 ? (totalLaborHours / invoicedAmount) * 1000 : 0;

  // ── Planning variance: compare actual site report hours vs planned durations ──
  let planningVariance: Array<{
    cfc_code: string;
    planned_days: number;
    actual_days: number;
    variance_pct: number;
  }> = [];

  try {
    // Get planning for this project
    const { data: planning } = await (admin as any)
      .from("project_plannings")
      .select("id")
      .eq("project_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (planning) {
      // Get planning tasks grouped by CFC code
      const { data: planningTasks } = await (admin as any)
        .from("planning_tasks")
        .select("cfc_code, duration_days")
        .eq("planning_id", planning.id)
        .not("cfc_code", "is", null);

      if (planningTasks && planningTasks.length > 0) {
        // Aggregate planned days by CFC code
        const plannedByCfc = new Map<string, number>();
        for (const t of planningTasks) {
          if (!t.cfc_code) continue;
          const prefix = t.cfc_code.split(".")[0];
          plannedByCfc.set(prefix, (plannedByCfc.get(prefix) || 0) + (t.duration_days || 0));
        }

        // Aggregate actual hours from site_report_entries by CFC code (convert hours to days: 8h = 1 day)
        if (reportIds.length > 0) {
          const { data: laborEntries } = await (admin as any)
            .from("site_report_entries")
            .select("data")
            .in("report_id", reportIds)
            .eq("entry_type", "labor");

          const actualHoursByCfc = new Map<string, number>();
          for (const entry of laborEntries || []) {
            const cfcCode = entry.data?.cfc_code;
            const hours = parseFloat(entry.data?.duration_hours || "0");
            if (cfcCode && hours > 0) {
              const prefix = cfcCode.split(".")[0];
              actualHoursByCfc.set(prefix, (actualHoursByCfc.get(prefix) || 0) + hours);
            }
          }

          // Build variance array for CFC codes that exist in both planned and actual
          for (const [cfc, plannedDays] of plannedByCfc) {
            const actualHours = actualHoursByCfc.get(cfc);
            if (actualHours !== undefined && plannedDays > 0) {
              const actualDays = Math.round((actualHours / 8) * 100) / 100;
              const variancePct = Math.round(((actualDays - plannedDays) / plannedDays) * 10000) / 100;
              planningVariance.push({
                cfc_code: cfc,
                planned_days: plannedDays,
                actual_days: actualDays,
                variance_pct: variancePct,
              });
            }
          }

          // Sort by absolute variance descending (biggest deviations first)
          planningVariance.sort((a, b) => Math.abs(b.variance_pct) - Math.abs(a.variance_pct));
        }
      }
    }
  } catch (err) {
    // Planning tables may not exist — non-blocking
    console.warn("[financials] Planning variance calculation error:", err);
  }

  return NextResponse.json({
    project_id: id,
    project_name: project.name,
    invoiced_amount: project.invoiced_amount ? invoicedAmount : null,
    purchase_costs: project.purchase_costs ? purchaseCosts : null,
    closed_at: project.closed_at,
    total_labor_hours: Math.round(totalLaborHours * 100) / 100,
    total_machine_hours: Math.round(totalMachineHours * 100) / 100,
    total_workers: totalWorkers,
    total_delivery_notes: totalDeliveryNotes,
    total_reports: totalReports,
    margin: Math.round(margin * 100) / 100,
    margin_pct: Math.round(marginPct * 100) / 100,
    cost_per_hour: Math.round(costPerHour * 100) / 100,
    hours_per_thousand: Math.round(hoursPerThousand * 100) / 100,
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
