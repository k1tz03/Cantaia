import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseBody, validateRequired } from "@/lib/api/parse-body";

/**
 * POST /api/emails/update
 * Updates an email record. Used for:
 * - Manual reclassification (change project_id)
 * - Mark as processed (set classification = 'archived')
 * - Mark as urgent (set classification = 'urgent')
 * Optionally adds sender to project's email_senders for learning.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: body, error: parseError } = await parseBody(request);
  if (parseError || !body) {
    return NextResponse.json({ error: parseError || "Invalid request" }, { status: 400 });
  }

  const requiredError = validateRequired(body, ["email_id"]);
  if (requiredError) {
    return NextResponse.json({ error: requiredError }, { status: 400 });
  }

  const admin = createAdminClient();

  // Verify the email belongs to this user
  const { data: email, error: fetchErr } = await admin
    .from("email_records")
    .select("id, user_id, sender_email, project_id")
    .eq("id", body.email_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (fetchErr || !email) {
    console.log("[emails/update] Email not found:", body.email_id, fetchErr?.message);
    return NextResponse.json({ error: "Email not found" }, { status: 404 });
  }

  // Build update payload
  const updateData: Record<string, unknown> = {};

  if (body.project_id !== undefined) {
    updateData.project_id = body.project_id;
    console.log(`[emails/update] Reclassifying email ${body.email_id} to project ${body.project_id}`);
  }

  if (body.classification !== undefined) {
    updateData.classification = body.classification;
    console.log(`[emails/update] Setting classification to "${body.classification}" for email ${body.email_id}`);
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  // Perform the update
  const { error: updateErr } = await admin
    .from("email_records")
    .update(updateData)
    .eq("id", body.email_id);

  if (updateErr) {
    console.error("[emails/update] ERROR updating email:", updateErr.message);
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  console.log("[emails/update] Email updated successfully:", body.email_id, updateData);

  // If reclassifying to a project, add sender to project's email_senders for future AI learning
  if (body.project_id && body.add_sender_to_project) {
    try {
      const { data: project } = await admin
        .from("projects")
        .select("email_senders")
        .eq("id", body.project_id)
        .maybeSingle();

      if (project) {
        const currentSenders: string[] = project.email_senders || [];
        const senderEmail = email.sender_email?.toLowerCase();
        if (senderEmail && !currentSenders.includes(senderEmail)) {
          const updatedSenders = [...currentSenders, senderEmail];
          await admin
            .from("projects")
            .update({ email_senders: updatedSenders })
            .eq("id", body.project_id);
          console.log(`[emails/update] Added sender "${senderEmail}" to project ${body.project_id} email_senders`);
        }
      }
    } catch (err) {
      console.error("[emails/update] Warning: Failed to update project email_senders:", err);
    }
  }

  return NextResponse.json({ success: true });
}
