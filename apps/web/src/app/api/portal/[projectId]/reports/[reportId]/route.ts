import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyPortalToken } from "@/lib/portal/auth";

async function checkPortalAuth(projectId: string) {
  const admin = createAdminClient();
  const { data: project } = await (admin as any)
    .from("projects")
    .select("portal_pin_salt, portal_enabled")
    .eq("id", projectId)
    .single();

  if (!project || !project.portal_enabled) return { valid: false as const, admin };
  const auth = await verifyPortalToken(projectId, project.portal_pin_salt || "");
  return { ...auth, admin };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string; reportId: string }> }
) {
  try {
    const { projectId, reportId } = await params;
    const { valid, admin } = await checkPortalAuth(projectId);
    if (!valid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: report } = await (admin as any)
      .from("site_reports")
      .select("*")
      .eq("id", reportId)
      .eq("project_id", projectId)
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
    console.error("[Portal Report Detail] GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; reportId: string }> }
) {
  try {
    const { projectId, reportId } = await params;
    const { valid, admin } = await checkPortalAuth(projectId);
    if (!valid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Check report belongs to project and is editable
    const { data: report } = await (admin as any)
      .from("site_reports")
      .select("id, status")
      .eq("id", reportId)
      .eq("project_id", projectId)
      .single();

    if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (report.status === "locked") return NextResponse.json({ error: "Report is locked" }, { status: 403 });

    const body = await request.json();

    // Update report fields
    const updates: Record<string, any> = {};
    if (body.remarks !== undefined) updates.remarks = body.remarks;
    if (body.weather !== undefined) updates.weather = body.weather;

    if (Object.keys(updates).length > 0) {
      await (admin as any).from("site_reports").update(updates).eq("id", reportId);
    }

    // Replace all entries if provided
    if (body.entries && Array.isArray(body.entries)) {
      // Delete existing entries
      await (admin as any).from("site_report_entries").delete().eq("report_id", reportId);

      // Insert new entries
      if (body.entries.length > 0) {
        const rows = body.entries.map((e: any) => ({
          report_id: reportId,
          entry_type: e.entry_type,
          crew_member_id: e.crew_member_id || null,
          work_description: e.work_description || null,
          duration_hours: e.duration_hours || null,
          is_driver: e.is_driver || false,
          machine_description: e.machine_description || null,
          is_rented: e.is_rented || false,
          note_number: e.note_number || null,
          supplier_name: e.supplier_name || null,
          photo_url: e.photo_url || null,
        }));
        await (admin as any).from("site_report_entries").insert(rows);
      }
    }

    // Submit if requested
    if (body.status === "submitted" && report.status === "draft") {
      await (admin as any).from("site_reports").update({ status: "submitted" }).eq("id", reportId);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Portal Report Detail] PATCH error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
