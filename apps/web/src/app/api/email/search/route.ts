import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/email/search?q=coffrage+dalle&project_id=xxx&from_date=...&to_date=...&has_attachments=true
 * Full-text search using PostgreSQL tsvector (French config).
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get("q");
  const projectId = searchParams.get("project_id");
  const categoryId = searchParams.get("category_id");
  const fromDate = searchParams.get("from_date");
  const toDate = searchParams.get("to_date");
  const hasAttachments = searchParams.get("has_attachments");
  const triageStatus = searchParams.get("triage_status");
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);

  const admin = createAdminClient();

  let q = (admin as any)
    .from("email_records")
    .select("id, subject, from_email, sender_email, from_name, sender_name, body_preview, received_at, has_attachments, project_id, email_category, classification, triage_status, process_action, ai_confidence, ai_summary")
    .eq("user_id", user.id);

  // Full-text search using tsvector
  if (query) {
    q = q.textSearch("search_vector", query, { type: "websearch", config: "french" });
  }

  // Filters
  if (projectId) q = q.eq("project_id", projectId);
  if (categoryId) q = q.eq("category_id", categoryId);
  if (fromDate) q = q.gte("received_at", fromDate);
  if (toDate) q = q.lte("received_at", toDate);
  if (hasAttachments === "true") q = q.eq("has_attachments", true);
  if (triageStatus) q = q.eq("triage_status", triageStatus);

  q = q.order("received_at", { ascending: false }).limit(limit);

  const { data: emails, error } = await q;

  if (error) {
    console.error("[email/search] Error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    results: emails || [],
    count: emails?.length || 0,
    query,
  });
}
