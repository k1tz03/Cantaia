import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/benchmarks/projects?project_type=xxx&region=xxx
 * Returns aggregated project benchmarks (C2 data).
 * Accessible to any authenticated user (project benchmarks are less sensitive).
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { searchParams } = new URL(request.url);
  const projectType = searchParams.get("project_type");
  const region = searchParams.get("region");

  try {
    let query = (admin as any)
      .from("project_benchmarks")
      .select("*")
      .order("project_type", { ascending: true });

    if (projectType) query = query.eq("project_type", projectType);
    if (region) query = query.eq("region", region);

    const { data: benchmarks, error } = await query.limit(100);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Also fetch task and PV benchmarks
    const [taskBench, pvBench] = await Promise.all([
      (admin as any).from("task_benchmarks").select("*").limit(50),
      (admin as any).from("pv_quality_benchmarks").select("*").limit(50),
    ]);

    return NextResponse.json({
      project_benchmarks: benchmarks || [],
      task_benchmarks: taskBench.data || [],
      pv_benchmarks: pvBench.data || [],
    });
  } catch (err: unknown) {
    console.error("[benchmarks/projects] Error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Internal error" }, { status: 500 });
  }
}
