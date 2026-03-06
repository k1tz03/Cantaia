import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/projects/[id]/emails
 * Returns all emails classified into a specific project.
 */
export async function GET(
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

  // Verify user belongs to the org that owns this project
  const { data: userRow } = await admin
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!userRow?.organization_id) {
    return NextResponse.json({ error: "No organization" }, { status: 403 });
  }

  const { data: project } = await admin
    .from("projects")
    .select("id")
    .eq("id", id)
    .eq("organization_id", userRow.organization_id)
    .maybeSingle();

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Pagination
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 200);
  const offset = (page - 1) * limit;

  // Return fields needed by EmailDetailPanel
  const { data: emails, error, count } = await (admin as any)
    .from("email_records")
    .select("id, subject, sender_email, sender_name, received_at, body_preview, project_id, classification, ai_classification_confidence, ai_project_match_confidence, ai_summary, ai_reasoning, classification_status, email_category, is_processed, is_read, has_attachments, outlook_message_id, recipients, suggested_project_data, linked_price_request_id, created_at", { count: "exact" })
    .eq("project_id", id)
    .eq("user_id", user.id)
    .order("received_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("[projects/[id]/emails] Error:", error.message);
    return NextResponse.json({ error: "Failed to fetch emails" }, { status: 500 });
  }

  const response = NextResponse.json({ emails: emails || [] });
  if (count !== null) response.headers.set("X-Total-Count", String(count));
  return response;
}
