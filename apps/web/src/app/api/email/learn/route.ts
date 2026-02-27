import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { learnFromClassificationAction } from "@cantaia/core/emails";

/**
 * POST /api/email/learn
 * Record user feedback to improve classification accuracy.
 * Body: {
 *   email_id: string,
 *   feedback_type: "confirm" | "correct" | "reject",
 *   correct_project_id?: string,
 *   correct_category?: string,
 * }
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    email_id: string;
    feedback_type: "confirm" | "correct" | "reject";
    correct_project_id?: string;
    correct_category?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.email_id || !body.feedback_type) {
    return NextResponse.json({ error: "email_id and feedback_type are required" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Get the email
  const { data: email } = await (admin as any)
    .from("emails")
    .select("id, user_id, project_id, sender_email, from_email, subject")
    .eq("id", body.email_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!email) {
    return NextResponse.json({ error: "Email not found" }, { status: 404 });
  }

  // Get org ID
  const { data: userOrg } = await admin
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!userOrg?.organization_id) {
    return NextResponse.json({ error: "No organization" }, { status: 400 });
  }

  try {
    const targetProjectId = body.correct_project_id || email.project_id;

    if (targetProjectId) {
      await learnFromClassificationAction({
        supabase: admin,
        organizationId: userOrg.organization_id,
        senderEmail: email.from_email || email.sender_email || "",
        subject: email.subject || "",
        projectId: targetProjectId,
        action: body.feedback_type,
        previousProjectId: email.project_id,
      });
    }

    // Update email classification status
    const update: Record<string, unknown> = {};
    if (body.feedback_type === "confirm") {
      update.classification_status = "confirmed";
    } else if (body.feedback_type === "correct" && body.correct_project_id) {
      update.project_id = body.correct_project_id;
      update.classification_status = "confirmed";
    } else if (body.feedback_type === "reject") {
      update.classification_status = "rejected";
      update.project_id = null;
    }

    if (body.correct_category) {
      update.email_category = body.correct_category;
    }

    if (Object.keys(update).length > 0) {
      await (admin as any)
        .from("emails")
        .update(update)
        .eq("id", body.email_id);
    }

    return NextResponse.json({ success: true, feedback_type: body.feedback_type });
  } catch (err) {
    console.error("[email/learn] Error:", err);
    return NextResponse.json(
      { error: `Learning failed: ${err instanceof Error ? err.message : "Unknown"}` },
      { status: 500 }
    );
  }
}
