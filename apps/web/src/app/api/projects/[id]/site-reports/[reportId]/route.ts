import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; reportId: string }> }
) {
  try {
    const { id, reportId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();
    const { data: profile } = await admin.from("users").select("organization_id").eq("id", user.id).single();

    const { data: project } = await admin
      .from("projects")
      .select("id, organization_id")
      .eq("id", id)
      .single();

    if (!project || project.organization_id !== profile?.organization_id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { data: report } = await (admin as any)
      .from("site_reports")
      .select("*")
      .eq("id", reportId)
      .eq("project_id", id)
      .single();

    if (!report) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    const { data: entries } = await (admin as any)
      .from("site_report_entries")
      .select("*, portal_crew_members(name, role)")
      .eq("report_id", reportId)
      .order("created_at", { ascending: true });

    return NextResponse.json({ report, entries: entries || [] });
  } catch (error) {
    console.error("[Site Report Detail] GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; reportId: string }> }
) {
  try {
    const { id, reportId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();
    const { data: profile } = await admin.from("users").select("organization_id").eq("id", user.id).single();

    const { data: project } = await admin
      .from("projects")
      .select("id, organization_id")
      .eq("id", id)
      .single();

    if (!project || project.organization_id !== profile?.organization_id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { data: report } = await (admin as any)
      .from("site_reports")
      .select("id, status")
      .eq("id", reportId)
      .eq("project_id", id)
      .single();

    if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await request.json();

    // Update status if provided
    if (body.status !== undefined) {
      await (admin as any).from("site_reports").update({ status: body.status }).eq("id", reportId);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Site Report Detail] PATCH error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
