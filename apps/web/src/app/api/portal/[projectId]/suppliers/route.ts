import { NextRequest, NextResponse } from "next/server";
import { requirePortalSession } from "@/lib/portal/session";

/**
 * GET /api/portal/[projectId]/suppliers
 *
 * Names of the organisation's suppliers, so a delivery note typed on site can
 * be linked to the real supplier row (site_report_entries.supplier_id,
 * migration 093) instead of the free-text name the assistant has to reconcile
 * by hand every Monday.
 *
 * Strictly id + company_name: no email, phone, score or price history is ever
 * exposed to a PIN-authenticated device. Free text stays valid as a fallback,
 * so an unknown supplier never blocks the report.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await params;
    const { valid, admin, organizationId } = await requirePortalSession(projectId);
    if (!valid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!organizationId) return NextResponse.json({ suppliers: [] });

    const { data: suppliers, error } = await (admin as any)
      .from("suppliers")
      .select("id, company_name")
      .eq("organization_id", organizationId)
      .order("company_name", { ascending: true })
      .limit(500);

    if (error) {
      console.warn("[Portal Suppliers] lookup failed:", error.message);
      return NextResponse.json({ suppliers: [] });
    }

    return NextResponse.json({
      suppliers: (suppliers || [])
        .filter((s: any) => s.company_name)
        .map((s: any) => ({ id: s.id, company_name: s.company_name })),
    });
  } catch (error) {
    console.error("[Portal Suppliers] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
