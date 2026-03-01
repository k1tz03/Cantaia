import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseBody } from "@/lib/api/parse-body";

/**
 * GET /api/projects/[id]
 * Returns a single project by ID for the authenticated user's organization.
 * Uses admin client to bypass RLS.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!id) {
    return NextResponse.json({ error: "Missing project ID" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Get user's organization
  const { data: userRow } = await admin
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!userRow?.organization_id) {
    return NextResponse.json({ error: "No organization" }, { status: 403 });
  }

  // Fetch the project (must belong to user's org)
  const { data: project, error } = await admin
    .from("projects")
    .select("*")
    .eq("id", id)
    .eq("organization_id", userRow.organization_id)
    .maybeSingle();

  if (error) {
    console.error("[projects/[id]] Error:", error.message);
    return NextResponse.json({ error: "Failed to fetch project" }, { status: 500 });
  }

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  return NextResponse.json({ project });
}

/**
 * PUT /api/projects/[id]
 * Updates a project. Only updates fields that are provided.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: userRow } = await admin
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!userRow?.organization_id) {
    return NextResponse.json({ error: "No organization" }, { status: 403 });
  }

  // Verify project belongs to user's org
  const { data: existing } = await admin
    .from("projects")
    .select("id")
    .eq("id", id)
    .eq("organization_id", userRow.organization_id)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const { data: body, error: parseError } = await parseBody(request);
  if (parseError || !body) {
    return NextResponse.json({ error: parseError || "Invalid request" }, { status: 400 });
  }

  // Allowlist of updatable fields
  const allowedFields = [
    "name", "code", "description", "client_name", "address", "city",
    "status", "start_date", "end_date", "budget_total", "currency",
    "color", "email_keywords", "email_senders",
  ];

  const updates: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (field in body) {
      updates[field] = body[field];
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { data: project, error } = await admin
    .from("projects")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    console.error("[projects/[id]] Update error:", error.message);
    return NextResponse.json({ error: "Failed to update project" }, { status: 500 });
  }

  return NextResponse.json({ project });
}

/**
 * DELETE /api/projects/[id]
 * Deletes a project and declassifies all its emails.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: userRow } = await admin
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!userRow?.organization_id) {
    return NextResponse.json({ error: "No organization" }, { status: 403 });
  }

  // Verify project belongs to user's org
  const { data: existing } = await admin
    .from("projects")
    .select("id")
    .eq("id", id)
    .eq("organization_id", userRow.organization_id)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Declassify all emails linked to this project
  await admin
    .from("email_records")
    .update({
      project_id: null,
      classification: null,
      classification_status: "classified_no_project",
      ai_classification_confidence: null,
      ai_project_match_confidence: null,
    } as Record<string, unknown>)
    .eq("project_id", id);

  // Delete the project (cascade will handle project_members, tasks, etc.)
  const { error } = await admin
    .from("projects")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("[projects/[id]] Delete error:", error.message);
    return NextResponse.json({ error: "Failed to delete project" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
