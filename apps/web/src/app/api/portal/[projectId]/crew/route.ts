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

  if (!project || !project.portal_enabled) return { valid: false, admin };
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

    const { data: crew } = await (admin as any)
      .from("portal_crew_members")
      .select("*")
      .eq("project_id", projectId)
      .eq("is_active", true)
      .order("name", { ascending: true });

    return NextResponse.json({ crew: crew || [] });
  } catch (error) {
    console.error("[Portal Crew] GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const { valid, admin } = await checkPortalAuth(projectId);
    if (!valid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    if (!body.name?.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const { data, error } = await (admin as any)
      .from("portal_crew_members")
      .insert({
        project_id: projectId,
        name: body.name.trim(),
        role: body.role?.trim() || null,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: "Failed to add" }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error("[Portal Crew] POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const { valid, admin } = await checkPortalAuth(projectId);
    if (!valid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = request.nextUrl;
    const memberId = searchParams.get("id");
    if (!memberId) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    // Soft delete
    await (admin as any)
      .from("portal_crew_members")
      .update({ is_active: false })
      .eq("id", memberId)
      .eq("project_id", projectId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Portal Crew] DELETE error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
