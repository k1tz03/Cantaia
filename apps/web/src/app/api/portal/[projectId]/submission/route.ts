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
      .select("portal_submission_id, portal_pin_salt, portal_enabled")
      .eq("id", projectId)
      .single();

    if (!project || !project.portal_enabled) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const auth = await verifyPortalToken(projectId, project.portal_pin_salt || "");
    if (!auth.valid) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!project.portal_submission_id) {
      return NextResponse.json({ items: [], groups: [] });
    }

    // Get submission items WITHOUT prices
    const { data: items } = await (admin as any)
      .from("submission_items")
      .select("id, item_number, description, unit, quantity, material_group, cfc_code, product_name")
      .eq("submission_id", project.portal_submission_id)
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
