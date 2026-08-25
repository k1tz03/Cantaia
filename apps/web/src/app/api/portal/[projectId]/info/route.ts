import { NextRequest, NextResponse } from "next/server";
import { requirePortalSession } from "@/lib/portal/session";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const { valid, userName, project } = await requirePortalSession(projectId);

    // No project / portal disabled → 404 (never leak that the project exists).
    if (!project) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Portal enabled but no valid session: the site name/code is not sensitive
    // (the portal is already bound to the project URL) and lets the PIN screen
    // show which site the crew is signing in to.
    if (!valid) {
      return NextResponse.json(
        { error: "Unauthorized", projectName: project.name, projectCode: project.code },
        { status: 401 },
      );
    }

    return NextResponse.json({
      name: project.name,
      code: project.code,
      address: project.address,
      city: project.city,
      status: project.status,
      description: project.description,
      client_name: project.clientName,
      userName,
    });
  } catch (error) {
    console.error("[Portal Info] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
