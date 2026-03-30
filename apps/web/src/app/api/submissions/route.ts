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
      .select("*, projects!submissions_project_id_fkey(id, name, code, color, client_name, city)")
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

// POST — create a new submission
//
// Supports two upload modes:
//
// Mode A — Direct upload (preferred, no Vercel body limit):
//   Content-Type: application/json
//   { storage_path, file_name, file_type, project_id?, project_name?, client_name?, city?, deadline? }
//   The file was already uploaded directly to Supabase Storage via GET /api/submissions/upload-url.
//
// Mode B — Legacy FormData (backward-compat, subject to ~4.5 MB Vercel body limit):
//   Content-Type: multipart/form-data
//   { file, project_id?, project_name?, client_name?, city?, deadline? }
//
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();
    const { data: profile } = await admin.from("users").select("organization_id").eq("id", user.id).maybeSingle();
    if (!profile?.organization_id) return NextResponse.json({ error: "No organization" }, { status: 400 });

    const contentType = request.headers.get("content-type") || "";
    const isJsonMode = contentType.includes("application/json");

    let fileName: string;
    let fileType: string;
    let fileUrl: string | null = null;
    let projectId: string | null = null;
    let projectName: string | null = null;
    let clientName: string | null = null;
    let city: string | null = null;
    let deadline: string | null = null;

    if (isJsonMode) {
      // ── Mode A: file already uploaded to Supabase Storage ──
      const body = await request.json();
      const storagePath: string | null = body.storage_path || null;
      fileName = body.file_name || "";
      fileType = body.file_type || (fileName.toLowerCase().endsWith(".pdf") ? "pdf" : "excel");
      projectId = body.project_id || null;
      projectName = body.project_name || null;
      clientName = body.client_name || null;
      city = body.city || null;
      deadline = body.deadline || null;

      if (!storagePath || !fileName) {
        return NextResponse.json({ error: "storage_path and file_name are required" }, { status: 400 });
      }

      // Verify the file was actually uploaded to THIS org's path
      // (storagePath format: {org_id}/{project_id_or_no-project}/{timestamp}_{filename})
      const pathOrgId = storagePath.split("/")[0];
      if (pathOrgId !== profile.organization_id) {
        return NextResponse.json({ error: "Forbidden: storage path belongs to another organization" }, { status: 403 });
      }

      fileUrl = storagePath;

    } else {
      // ── Mode B: legacy FormData upload ──
      const formData = await request.formData();
      const file = formData.get("file") as File | null;
      projectId = formData.get("project_id") as string | null;
      projectName = formData.get("project_name") as string | null;
      clientName = formData.get("client_name") as string | null;
      city = formData.get("city") as string | null;
      deadline = formData.get("deadline") as string | null;

      if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
      if (file.size > 20 * 1024 * 1024) {
        return NextResponse.json({ error: "Fichier trop volumineux (20 Mo max)." }, { status: 400 });
      }

      fileName = file.name;
      const ext = fileName.split(".").pop()?.toLowerCase();
      if (!ext || !["pdf", "xlsx", "xls"].includes(ext)) {
        return NextResponse.json({ error: "Format non supporté. Utilisez PDF, XLSX ou XLS." }, { status: 400 });
      }
      fileType = ext === "pdf" ? "pdf" : "excel";

      // Resolve projectId early (needed for storage path)
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
      const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
      const storagePath = `${profile.organization_id}/${projectId}/${Date.now()}_${sanitizedFileName}`;

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
      fileUrl = uploadError ? null : storagePath;
    }

    // ── Create project if still needed (JSON mode with project_name) ──
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

    // ── Verify project belongs to user's org ──
    const { data: projCheck } = await admin
      .from("projects")
      .select("organization_id")
      .eq("id", projectId)
      .maybeSingle();
    if (!projCheck || projCheck.organization_id !== profile.organization_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // ── Create submission record ──
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
