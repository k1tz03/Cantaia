import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/plans/upload
 * Upload a plan file to Supabase Storage and create plan_registry + plan_versions records.
 * Expects FormData with: file, project_id, plan_number, plan_title, and optional fields.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminClient = createAdminClient();

    // Get user's org
    const { data: userOrg } = await adminClient
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!userOrg?.organization_id) {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const projectId = formData.get("project_id") as string;
    const planNumber = formData.get("plan_number") as string;
    const planTitle = formData.get("plan_title") as string;
    const planType = (formData.get("plan_type") as string) || "execution";
    const discipline = (formData.get("discipline") as string) || null;
    const versionCode = (formData.get("version_code") as string) || "A";
    const lotName = (formData.get("lot_name") as string) || null;
    const zone = (formData.get("zone") as string) || null;
    const scale = (formData.get("scale") as string) || null;
    const format = (formData.get("format") as string) || null;
    const authorCompany = (formData.get("author_company") as string) || null;
    const authorName = (formData.get("author_name") as string) || null;
    const notes = (formData.get("notes") as string) || null;

    if (!file || !projectId || !planNumber || !planTitle) {
      return NextResponse.json(
        { error: "file, project_id, plan_number, and plan_title are required" },
        { status: 400 }
      );
    }

    // Validate file size (50MB max)
    const MAX_SIZE = 50 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: "File too large (max 50MB)" },
        { status: 413 }
      );
    }

    // Upload file to Supabase Storage
    const orgId = userOrg.organization_id;
    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${orgId}/${projectId}/${timestamp}_${safeName}`;

    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await (adminClient as any).storage
      .from("plans")
      .upload(storagePath, buffer, {
        contentType: file.type || "application/pdf",
        upsert: false,
      });

    if (uploadError) {
      console.error("[plans/upload] Storage upload error:", uploadError);
      return NextResponse.json(
        { error: "Failed to upload file" },
        { status: 500 }
      );
    }

    // Get public URL
    const { data: urlData } = (adminClient as any).storage
      .from("plans")
      .getPublicUrl(storagePath);

    const fileUrl = urlData?.publicUrl || "";

    // Create plan_registry record
    const { data: plan, error: planError } = await (adminClient as any)
      .from("plan_registry")
      .insert({
        project_id: projectId,
        organization_id: orgId,
        plan_number: planNumber,
        plan_title: planTitle,
        plan_type: planType,
        discipline: discipline || null,
        lot_name: lotName,
        zone,
        scale,
        format,
        author_company: authorCompany,
        author_name: authorName,
        notes,
        status: "active",
      })
      .select("id")
      .single();

    if (planError) {
      console.error("[plans/upload] plan_registry insert error:", planError);
      return NextResponse.json(
        { error: "Failed to create plan record" },
        { status: 500 }
      );
    }

    // Create plan_versions record
    const { error: versionError } = await (adminClient as any)
      .from("plan_versions")
      .insert({
        plan_id: plan.id,
        organization_id: orgId,
        project_id: projectId,
        version_code: versionCode,
        version_number: 1,
        version_date: new Date().toISOString(),
        file_url: fileUrl,
        file_name: file.name,
        file_size: file.size,
        file_type: file.type || "application/pdf",
        source: "manual_upload",
        is_current: true,
        validation_status: "pending",
      });

    if (versionError) {
      console.error("[plans/upload] plan_versions insert error:", versionError);
      // Plan was created, version failed — still return the plan
      return NextResponse.json({
        success: true,
        plan_id: plan.id,
        warning: "Plan created but version record failed",
      });
    }

    return NextResponse.json({
      success: true,
      plan_id: plan.id,
    });
  } catch (error: any) {
    console.error("[plans/upload] Error:", error);
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
