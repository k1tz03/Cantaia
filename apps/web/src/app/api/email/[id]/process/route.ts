import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { learnFromClassificationAction } from "@cantaia/core/emails";

/**
 * PATCH /api/email/[id]/process
 * Process an email with a specific action.
 * Body: { action: ProcessAction, data?: { project_id?, category_id?, task_title?, ... } }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { action: string; data?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.action) {
    return NextResponse.json({ error: "action is required" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Verify email ownership
  const { data: email } = await (admin as any)
    .from("email_records")
    .select("id, user_id, project_id, sender_email, from_email, subject")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!email) {
    return NextResponse.json({ error: "Email not found" }, { status: 404 });
  }

  const now = new Date().toISOString();
  const action = body.action;

  // Build update payload based on action
  const update: Record<string, unknown> = {
    process_action: action,
    processed_at: now,
    processed_by: user.id,
  };

  switch (action) {
    case "read_ok":
      update.triage_status = "processed";
      break;

    case "replied":
      update.triage_status = "processed";
      break;

    case "task_created":
      update.triage_status = "processed";
      break;

    case "forwarded":
      update.triage_status = "processed";
      break;

    case "auto_dismissed":
    case "dismissed":
      update.triage_status = "processed";
      break;

    case "offer_imported":
      update.triage_status = "processed";
      break;

    case "plan_registered":
      update.triage_status = "processed";
      break;

    case "reclassify":
      // Reclassify doesn't process — just moves to different group
      delete update.process_action;
      delete update.processed_at;
      delete update.processed_by;
      if (body.data?.project_id) {
        update.project_id = body.data.project_id;
        update.classification_status = "confirmed";
        update.email_category = "project";
      }
      if (body.data?.category_id) {
        update.category_id = body.data.category_id;
      }
      break;

    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }

  // Apply update
  const { error: updateErr } = await (admin as any)
    .from("email_records")
    .update(update)
    .eq("id", id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  // Learn from reclassification
  if (action === "reclassify" && body.data?.project_id) {
    try {
      const { data: userOrg } = await admin
        .from("users")
        .select("organization_id")
        .eq("id", user.id)
        .maybeSingle();

      if (userOrg?.organization_id) {
        await learnFromClassificationAction({
          supabase: admin,
          organizationId: userOrg.organization_id,
          senderEmail: email.from_email || email.sender_email || "",
          subject: email.subject || "",
          projectId: body.data.project_id as string,
          action: email.project_id ? "correct" : "confirm",
          previousProjectId: email.project_id,
        });
      }
    } catch { /* learning must not block */ }
  }

  return NextResponse.json({ success: true, action });
}
