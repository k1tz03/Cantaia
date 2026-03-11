"use server";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// GET — list submissions for user's org (optionally filtered by project_id)
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();
    const { data: profile } = await admin.from("users").select("organization_id").eq("id", user.id).maybeSingle();
    if (!profile?.organization_id) return NextResponse.json({ error: "No organization" }, { status: 400 });

    const projectId = request.nextUrl.searchParams.get("project_id");

    let query = (admin as any)
      .from("submissions")
      .select("*, projects(id, name, code, color, client_name, city)")
      .eq("organization_id", profile.organization_id)
      .order("created_at", { ascending: false });

    if (projectId) {
      query = query.eq("project_id", projectId);
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true, submissions: data || [] });
  } catch (err: any) {
    console.error("[submissions] GET error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST — create a new submission (upload file + optionally create project)
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();
    const { data: profile } = await admin.from("users").select("organization_id").eq("id", user.id).maybeSingle();
    if (!profile?.organization_id) return NextResponse.json({ error: "No organization" }, { status: 400 });

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const projectName = formData.get("project_name") as string | null;
    const clientName = formData.get("client_name") as string | null;
    const city = formData.get("city") as string | null;
    const deadline = formData.get("deadline") as string | null;
    let projectId = formData.get("project_id") as string | null;

    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
    if (file.size > 20 * 1024 * 1024) return NextResponse.json({ error: "File too large (20MB max)" }, { status: 400 });

    const fileName = file.name;
    const ext = fileName.split(".").pop()?.toLowerCase();
    if (!ext || !["pdf", "xlsx", "xls"].includes(ext)) {
      return NextResponse.json({ error: "Unsupported format. Use PDF, XLSX, or XLS." }, { status: 400 });
    }
    const fileType = ext === "pdf" ? "pdf" : "excel";

    // Create project if no project_id provided
    if (!projectId && projectName) {
      const { data: project, error: projError } = await admin
        .from("projects")
        .insert({
          name: projectName,
          client_name: clientName || null,
          city: city || null,
          status: "planning",
          organization_id: profile.organization_id,
        } as any)
        .select("id")
        .single();

      if (projError) return NextResponse.json({ error: projError.message }, { status: 500 });
      projectId = project.id;
    }

    if (!projectId) return NextResponse.json({ error: "project_id or project_name required" }, { status: 400 });

    // Upload file to Supabase Storage
    const arrayBuffer = await file.arrayBuffer();
    const storagePath = `${profile.organization_id}/${projectId}/${Date.now()}_${fileName}`;

    const { error: uploadError } = await admin.storage
      .from("submissions")
      .upload(storagePath, Buffer.from(arrayBuffer), {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("[submissions] Upload error:", uploadError);
      // Continue without file URL if storage bucket doesn't exist yet
    }

    const fileUrl = uploadError ? null : storagePath;

    // Create submission record (cast: migration 049 tables)
    const { data: submission, error: subError } = await (admin as any)
      .from("submissions")
      .insert({
        project_id: projectId,
        organization_id: profile.organization_id,
        user_id: user.id,
        file_url: fileUrl,
        file_name: fileName,
        file_type: fileType,
        analysis_status: "pending",
      })
      .select()
      .single();

    if (subError) return NextResponse.json({ error: subError.message }, { status: 500 });

    // Update project deadline if provided
    if (deadline && projectId) {
      await admin.from("projects").update({ end_date: deadline } as any).eq("id", projectId);
    }

    return NextResponse.json({
      success: true,
      submission,
      project_id: projectId,
    });
  } catch (err: any) {
    console.error("[submissions] POST error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
