import { NextRequest, NextResponse } from "next/server";
import { requirePortalSession } from "@/lib/portal/session";

// Never `select("*")` here: portal_crew_members carries hourly_rate_chf
// (migration 093) and wages must not travel to a PIN-authenticated device.
const CREW_PUBLIC_COLUMNS = "id, name, role, is_active, created_at";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const { valid, admin } = await requirePortalSession(projectId);
    if (!valid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: crew } = await (admin as any)
      .from("portal_crew_members")
      .select(CREW_PUBLIC_COLUMNS)
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
    const { valid, admin } = await requirePortalSession(projectId);
    if (!valid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    if (!body.name?.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    // hourly_rate_chf is deliberately NOT accepted from the field: rates are set
    // by the conductor app-side.
    const { data, error } = await (admin as any)
      .from("portal_crew_members")
      .insert({
        project_id: projectId,
        name: body.name.trim().slice(0, 120),
        role: body.role?.trim().slice(0, 60) || null,
      })
      .select(CREW_PUBLIC_COLUMNS)
      .single();

    if (error) {
      console.error("[Portal Crew] POST insert error:", error);
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
    const { valid, admin } = await requirePortalSession(projectId);
    if (!valid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = request.nextUrl;
    const memberId = searchParams.get("id");
    if (!memberId) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    // Soft delete — past reports keep pointing at the member.
    const { error } = await (admin as any)
      .from("portal_crew_members")
      .update({ is_active: false })
      .eq("id", memberId)
      .eq("project_id", projectId);

    if (error) {
      console.error("[Portal Crew] DELETE error:", error);
      return NextResponse.json({ error: "Failed to remove" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Portal Crew] DELETE error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
