import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildPVPdf } from "../../_shared/pv-pdf";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();

    // Verify user's organization
    const { data: userProfile } = await (admin as any)
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .maybeSingle();

    // A user without an organization can never own a meeting
    if (!userProfile?.organization_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: meeting } = await admin
      .from("meetings")
      .select("*, projects(name, code, organization_id)")
      .eq("id", id)
      .maybeSingle();

    if (!meeting || !meeting.pv_content) {
      return NextResponse.json(
        { error: "Meeting or PV not found" },
        { status: 404 }
      );
    }

    // Verify meeting's project belongs to user's org (unconditional)
    const proj = (meeting as any).projects;
    if (!proj || proj.organization_id !== userProfile.organization_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Branding, opposition notice and signature block all live in buildPVPdf,
    // so the downloaded file and the circulated attachment are byte-identical.
    const { buffer, filename } = await buildPVPdf(
      admin,
      meeting,
      userProfile.organization_id
    );

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error: any) {
    const msg = error?.message || String(error);
    const stack = (error?.stack || "").split("\n").slice(0, 5).join("\n");
    console.error("[ExportPDF] Error:", msg);
    console.error("[ExportPDF] Stack:", stack);
    return NextResponse.json(
      { error: `Erreur génération PDF: ${msg}` },
      { status: 500 }
    );
  }
}
