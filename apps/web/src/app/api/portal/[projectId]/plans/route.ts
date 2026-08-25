import { NextRequest, NextResponse } from "next/server";
import { requirePortalSession } from "@/lib/portal/session";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const { valid, admin } = await requirePortalSession(projectId);
    if (!valid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: plans } = await (admin as any)
      .from("plan_registry")
      .select("id, plan_number, plan_title, plan_type, discipline, status, is_current_version")
      .eq("project_id", projectId)
      .eq("is_current_version", true)
      .order("plan_number", { ascending: true });

    const planList = plans || [];
    const planIds = planList.map((p: any) => p.id);

    // One query for every version instead of one per plan (was N+1: 40 plans =
    // 41 round-trips on a mobile site network). Keep the latest per plan.
    const latestByPlan = new Map<string, any>();
    if (planIds.length > 0) {
      const { data: versions } = await (admin as any)
        .from("plan_versions")
        .select("plan_id, version_number, file_url, file_name, file_type")
        .in("plan_id", planIds)
        .order("version_number", { ascending: false });

      for (const v of versions || []) {
        if (!latestByPlan.has(v.plan_id)) latestByPlan.set(v.plan_id, v);
      }
    }

    const enriched = planList.map((plan: any) => {
      const version = latestByPlan.get(plan.id);
      return {
        ...plan,
        file_url: version?.file_url || null,
        file_name: version?.file_name || null,
        file_type: version?.file_type || null,
      };
    });

    return NextResponse.json({ plans: enriched });
  } catch (error) {
    console.error("[Portal Plans] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
