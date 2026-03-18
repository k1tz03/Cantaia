import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/planning/public/[token]
 * Fetch planning data for a public shared link.
 * NO AUTH REQUIRED — this is a public endpoint.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;

    if (!token || token.length < 10) {
      return NextResponse.json({ error: "Invalid token" }, { status: 400 });
    }

    const admin = createAdminClient();

    // Fetch share record
    const { data: share, error: shareError } = await (admin as any)
      .from("planning_shares")
      .select("id, planning_id, is_active, expires_at")
      .eq("token", token)
      .maybeSingle();

    if (shareError || !share) {
      return NextResponse.json({ error: "Link not found" }, { status: 404 });
    }

    // Check if active
    if (!share.is_active) {
      return NextResponse.json({ error: "This link has been revoked" }, { status: 410 });
    }

    // Check expiration
    if (share.expires_at && new Date(share.expires_at) < new Date()) {
      return NextResponse.json({ error: "This link has expired" }, { status: 410 });
    }

    // Fetch planning (no org-sensitive fields)
    const { data: planning } = await (admin as any)
      .from("project_plannings")
      .select("id, title, start_date, target_end_date, calculated_end_date, project_type, status, projects(name)")
      .eq("id", share.planning_id)
      .maybeSingle();

    if (!planning) {
      return NextResponse.json({ error: "Planning not found" }, { status: 404 });
    }

    // Fetch phases
    const { data: phases } = await (admin as any)
      .from("planning_phases")
      .select("id, name, cfc_codes, color, sort_order, start_date, end_date")
      .eq("planning_id", share.planning_id)
      .order("sort_order", { ascending: true });

    // Fetch tasks (exclude supplier_id for privacy)
    const { data: tasks } = await (admin as any)
      .from("planning_tasks")
      .select("id, phase_id, name, cfc_code, start_date, end_date, duration_days, quantity, unit, productivity_ratio, productivity_source, adjustment_factors, base_duration_days, team_size, progress, is_milestone, milestone_type, sort_order")
      .eq("planning_id", share.planning_id)
      .order("sort_order", { ascending: true });

    // Fetch dependencies
    const { data: dependencies } = await (admin as any)
      .from("planning_dependencies")
      .select("id, predecessor_id, successor_id, dependency_type, lag_days, source")
      .eq("planning_id", share.planning_id);

    return NextResponse.json({
      planning: {
        ...planning,
        project_name: planning.projects?.name || null,
        projects: undefined,
      },
      phases: phases || [],
      tasks: tasks || [],
      dependencies: dependencies || [],
    });
  } catch (err: any) {
    console.error("[planning/public] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
