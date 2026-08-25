import { NextRequest, NextResponse } from "next/server";
import { requirePortalSession } from "@/lib/portal/session";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const { valid, admin, project } = await requirePortalSession(projectId);
    if (!valid || !project) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (!project.submissionId) {
      return NextResponse.json({ items: [], groups: [] });
    }

    // Get submission items WITHOUT prices
    const { data: items } = await (admin as any)
      .from("submission_items")
      .select("id, item_number, description, unit, quantity, material_group, cfc_code, product_name")
      .eq("submission_id", project.submissionId)
      .order("item_number", { ascending: true });

    // Group by material_group
    const groups: Record<string, any[]> = {};
    for (const item of (items || [])) {
      const group = item.material_group || "Divers";
      if (!groups[group]) groups[group] = [];
      groups[group].push({
        id: item.id,
        number: item.item_number,
        description: item.description,
        unit: item.unit,
        quantity: item.quantity,
        cfc_code: item.cfc_code,
        product_name: item.product_name,
      });
    }

    const groupList = Object.entries(groups).map(([name, posts]) => ({
      name,
      count: posts.length,
      items: posts,
    }));

    return NextResponse.json({ groups: groupList, total: (items || []).length });
  } catch (error) {
    console.error("[Portal Submission] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
