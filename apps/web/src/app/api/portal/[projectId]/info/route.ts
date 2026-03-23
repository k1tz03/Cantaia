import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyPortalToken } from "@/lib/portal/auth";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const admin = createAdminClient();

    const { data: project } = await (admin as any)
      .from("projects")
      .select("id, name, code, address, city, status, portal_description, portal_pin_salt, portal_enabled")
      .eq("id", projectId)
      .single();

    if (!project || !project.portal_enabled) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const auth = await verifyPortalToken(projectId, project.portal_pin_salt || "");
    if (!auth.valid) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json({
      name: project.name,
      code: project.code,
      address: project.address,
      city: project.city,
      status: project.status,
      description: project.portal_description,
      userName: auth.userName,
    });
  } catch (error) {
    console.error("[Portal Info] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
