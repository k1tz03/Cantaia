import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAppUrl } from "@/lib/env";
import { generatePin, generateSalt, hashPin } from "@/lib/portal/auth";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();
    const { data: profile } = await admin.from("users").select("organization_id").eq("id", user.id).single();

    const { data: project } = await (admin as any)
      .from("projects")
      .select("id, organization_id, portal_enabled, portal_description, portal_submission_id")
      .eq("id", id)
      .single();

    if (!project || project.organization_id !== profile?.organization_id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Get submissions for dropdown
    const { data: submissions } = await (admin as any)
      .from("submissions")
      .select("id, title, reference")
      .eq("project_id", id)
      .order("created_at", { ascending: false });

    // Get report count
    const { count: reportCount } = await (admin as any)
      .from("site_reports")
      .select("id", { count: "exact", head: true })
      .eq("project_id", id);

    return NextResponse.json({
      portal_enabled: project.portal_enabled || false,
      portal_description: project.portal_description || "",
      portal_submission_id: project.portal_submission_id || null,
      submissions: submissions || [],
      report_count: reportCount || 0,
      portal_url: `${getAppUrl()}/portal/${id}`,
    });
  } catch (error) {
    console.error("[Portal Config] GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();
    const { data: profile } = await admin.from("users").select("organization_id").eq("id", user.id).single();

    const { data: project } = await (admin as any)
      .from("projects")
      .select("id, organization_id, portal_pin_hash")
      .eq("id", id)
      .single();

    if (!project || project.organization_id !== profile?.organization_id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await request.json();
    const updates: Record<string, any> = {};

    if (typeof body.portal_enabled === "boolean") {
      updates.portal_enabled = body.portal_enabled;
    }
    if (typeof body.portal_description === "string") {
      updates.portal_description = body.portal_description;
    }
    if (body.portal_submission_id !== undefined) {
      updates.portal_submission_id = body.portal_submission_id || null;
    }
    if (body.generate_pin === true) {
      const pin = generatePin();
      const salt = generateSalt();
      updates.portal_pin_hash = hashPin(pin, salt);
      updates.portal_pin_salt = salt;
      updates.portal_enabled = true;

      // Return the PIN only this once (it's never stored in clear)
      const { error } = await (admin as any).from("projects").update(updates).eq("id", id);
      if (error) {
        return NextResponse.json({ error: "Failed to update" }, { status: 500 });
      }
      return NextResponse.json({ success: true, pin });
    }

    if (Object.keys(updates).length > 0) {
      const { error } = await (admin as any).from("projects").update(updates).eq("id", id);
      if (error) {
        return NextResponse.json({ error: "Failed to update" }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Portal Config] POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
