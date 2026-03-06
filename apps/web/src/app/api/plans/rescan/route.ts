import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getValidMicrosoftToken } from "@/lib/microsoft/tokens";
import { isPotentialPlan, detectPlansInEmail, savePlanFromAttachment } from "@cantaia/core/plans";
import { getAttachments as graphGetAttachments } from "@cantaia/core/outlook";

/**
 * POST /api/plans/rescan
 * Re-scan all classified emails for plan attachments.
 * Used to retroactively detect plans after the storage bucket is created
 * or after the has_attachments bug was fixed.
 */
export async function POST() {
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

    // Get valid Graph API token
    const tokenResult = await getValidMicrosoftToken(user.id);
    if (!tokenResult.accessToken) {
      return NextResponse.json(
        { error: "No valid Microsoft token. Please re-authenticate." },
        { status: 401 }
      );
    }
    const graphToken = tokenResult.accessToken;

    // Get user's projects
    const { data: memberships } = await adminClient
      .from("project_members")
      .select("project_id")
      .eq("user_id", user.id);
    const projectIds = (memberships || []).map((m: any) => m.project_id);

    if (projectIds.length === 0) {
      return NextResponse.json({ success: true, scanned: 0, plans_saved: 0 });
    }

    // Get projects info for detection context
    const { data: projects } = await (adminClient as any)
      .from("projects")
      .select("id, name, code")
      .in("id", projectIds);

    const projectMap = new Map<string, { id: string; name: string; code: string }>((projects || []).map((p: any) => [p.id, p]));

    // Get ALL classified emails that have a project_id and an outlook_message_id
    // We don't rely on has_attachments since it was historically bugged
    const { data: classifiedEmails } = await (adminClient as any)
      .from("email_records")
      .select("id, project_id, outlook_message_id, subject, sender_email, sender_name, body_preview")
      .eq("user_id", user.id)
      .in("project_id", projectIds)
      .not("outlook_message_id", "is", null)
      .order("received_at", { ascending: false })
      .limit(200);

    if (!classifiedEmails || classifiedEmails.length === 0) {
      return NextResponse.json({ success: true, scanned: 0, plans_saved: 0 });
    }

    let scanned = 0;
    let plansSaved = 0;
    const errors: string[] = [];

    for (const email of classifiedEmails) {
      try {
        // Fetch attachments from Graph API
        const attachments = await graphGetAttachments(graphToken, email.outlook_message_id);

        // Also fix has_attachments if it was wrong
        if (attachments.length > 0) {
          await (adminClient as any)
            .from("email_records")
            .update({ has_attachments: true })
            .eq("id", email.id);
        }

        // Filter for potential plans
        const potentialPlans = attachments.filter((a) =>
          isPotentialPlan({ id: a.id, name: a.name, contentType: a.contentType, size: a.size })
        );

        if (potentialPlans.length === 0) {
          scanned++;
          continue;
        }

        const project = projectMap.get(email.project_id);

        // Run plan detection
        const detections = await detectPlansInEmail(
          email.id,
          potentialPlans.map((a) => ({ id: a.id, name: a.name, contentType: a.contentType, size: a.size })),
          {
            sender_email: email.sender_email || "",
            sender_name: email.sender_name || "",
            subject: email.subject || "",
            body_excerpt: email.body_preview || "",
            project_name: project?.name || "",
            project_code: project?.code || "",
            lots_list: "",
            existing_plans_summary: "",
          }
        );

        // Save detected plans
        for (let i = 0; i < detections.length; i++) {
          const det = detections[i];
          if (det.is_plan && det.confidence >= 0.7) {
            const att = potentialPlans[i];
            const saved = await savePlanFromAttachment({
              supabase: adminClient,
              graphAccessToken: graphToken,
              messageId: email.outlook_message_id,
              attachment: { id: att.id, name: att.name, contentType: att.contentType, size: att.size },
              detection: det,
              emailId: email.id,
              projectId: email.project_id,
              organizationId: userOrg.organization_id,
              userId: user.id,
            });
            if (saved) {
              plansSaved++;
              if (process.env.NODE_ENV === "development") console.log(`[rescan] Plan saved: ${att.name} → ${saved.planId}`);
            }
          }
        }

        scanned++;
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : "Unknown error";
        console.warn(`[rescan] Error for email ${email.id}:`, errMsg);
        errors.push(`${email.subject}: ${errMsg}`);
        scanned++;
      }
    }

    if (process.env.NODE_ENV === "development") console.log(`[rescan] Done: scanned=${scanned}, plans_saved=${plansSaved}`);

    return NextResponse.json({
      success: true,
      scanned,
      plans_saved: plansSaved,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: unknown) {
    console.error("[rescan] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
