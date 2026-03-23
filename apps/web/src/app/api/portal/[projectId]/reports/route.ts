import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyPortalToken } from "@/lib/portal/auth";

async function checkPortalAuth(projectId: string) {
  const admin = createAdminClient();
  const { data: project } = await admin
    .from("projects")
    .select("portal_pin_salt, portal_enabled")
    .eq("id", projectId)
    .single();

  if (!project || !project.portal_enabled) return { valid: false as const, admin, userName: undefined };
  const auth = await verifyPortalToken(projectId, project.portal_pin_salt || "");
  return { ...auth, admin };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const { valid, admin } = await checkPortalAuth(projectId);
    if (!valid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: reports } = await (admin as any)
      .from("site_reports")
      .select("*")
      .eq("project_id", projectId)
      .order("report_date", { ascending: false })
      .limit(14);

    return NextResponse.json({ reports: reports || [] });
  } catch (error) {
    console.error("[Portal Reports] GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const { valid, admin, userName } = await checkPortalAuth(projectId);
    if (!valid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const reportDate = body.report_date || new Date().toISOString().split("T")[0];

    // Check if report already exists for this date + user
    const { data: existing } = await (admin as any)
      .from("site_reports")
      .select("id")
      .eq("project_id", projectId)
      .eq("report_date", reportDate)
      .eq("submitted_by_name", userName || body.submitted_by_name || "")
      .single();

    if (existing) {
      return NextResponse.json({ error: "Report already exists for this date", report_id: existing.id }, { status: 409 });
    }

    const { data: report, error } = await (admin as any)
      .from("site_reports")
      .insert({
        project_id: projectId,
        report_date: reportDate,
        submitted_by_name: userName || body.submitted_by_name || "",
        status: "draft",
        remarks: body.remarks || null,
        weather: body.weather || null,
      })
      .select()
      .single();

    if (error) {
      console.error("[Portal Reports] POST error:", error);
      return NextResponse.json({ error: "Failed to create report" }, { status: 500 });
    }

    return NextResponse.json(report, { status: 201 });
  } catch (error) {
    console.error("[Portal Reports] POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
