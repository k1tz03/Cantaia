import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { learnFromClassificationAction } from "@cantaia/core/emails";
import { logLearningFailure } from "@cantaia/core/learning";
import { parseBody, validateRequired } from "@/lib/api/parse-body";

/**
 * POST /api/emails/confirm-classification
 * Handles user actions on AI-suggested email classifications:
 * - "confirm"        — Confirms the AI suggestion. Updates classification_status to "confirmed".
 *                      If the email was "suggested", adds the sender to the project's email_senders.
 * - "change_project" — User changes the project. Updates email project_id and classification_status
 *                      to "confirmed". Adds sender to the new project's email_senders.
 * - "reject"         — Rejects classification. Sets classification_status to "rejected",
 *                      classification to null, project_id to null.
 */
export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "development") console.log("[emails/confirm-classification] Starting...");

  // 1. Auth check
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Parse body
  const { data: body, error: parseError } = await parseBody(request);
  if (parseError || !body) {
    return NextResponse.json({ error: parseError || "Invalid request" }, { status: 400 });
  }

  const requiredError = validateRequired(body, ["email_id", "action"]);
  if (requiredError) {
    return NextResponse.json({ error: requiredError }, { status: 400 });
  }

  const { email_id, action, project_id } = body as {
    email_id: string;
    action: "confirm" | "change_project" | "reject";
    project_id?: string;
  };

  if (!["confirm", "change_project", "reject"].includes(action)) {
    return NextResponse.json(
      { error: "action must be one of: confirm, change_project, reject" },
      { status: 400 }
    );
  }

  if (action === "change_project" && !project_id) {
    return NextResponse.json(
      { error: "project_id is required for change_project action" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // 3. Get user's organization
  const { data: userOrg } = await admin
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();

  // 4. Fetch the email and verify ownership
  const { data: email, error: fetchErr } = await admin
    .from("email_records")
    .select("id, user_id, sender_email, subject, project_id, classification_status, classification")
    .eq("id", email_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (fetchErr || !email) {
    if (process.env.NODE_ENV === "development") console.log("[emails/confirm-classification] Email not found:", email_id, fetchErr?.message);
    return NextResponse.json({ error: "Email not found" }, { status: 404 });
  }

  // Anti-IDOR: a change_project target must belong to the caller's org.
  // Admin client bypasses RLS, so validate the ownership explicitly.
  if (action === "change_project") {
    if (!userOrg?.organization_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { data: proj } = await admin
      .from("projects")
      .select("id, organization_id")
      .eq("id", project_id!)
      .maybeSingle();
    if (!proj || proj.organization_id !== userOrg.organization_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  // 4. Handle each action
  if (action === "confirm") {
    // Confirm the existing AI suggestion
    const { error: updateErr } = await admin
      .from("email_records")
      .update({ classification_status: "confirmed" } as Record<string, unknown>)
      .eq("id", email_id);

    if (updateErr) {
      console.error("[emails/confirm-classification] ERROR confirming:", updateErr.message);
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    // If the email had a "suggested" status and a project_id, add sender to project email_senders
    if (email.classification_status === "suggested" && email.project_id) {
      await addSenderToProject(admin, email.sender_email, email.project_id, userOrg?.organization_id);
    }

    // Learn from confirmation.
    // AUDIT 08/2026 — le `.catch(() => {})` nu avalait tout échec de ce chemin
    // d'apprentissage : il part désormais dans learning_events (write_failed).
    if (userOrg?.organization_id) {
      const orgIdForLog = userOrg.organization_id;
      learnFromClassificationAction({
        supabase: admin,
        organizationId: orgIdForLog,
        senderEmail: email.sender_email,
        subject: email.subject || "",
        projectId: email.project_id,
        action: "confirm",
        emailId: email.id,
        userId: user.id,
      }).catch((err) =>
        logLearningFailure(admin, {
          organizationId: orgIdForLog,
          module: "mail",
          error: err,
          context: { op: "learnFromClassificationAction", action: "confirm" },
        })
      );
    }

    if (process.env.NODE_ENV === "development") console.log("[emails/confirm-classification] Email confirmed:", email_id);
    return NextResponse.json({ success: true });
  }

  if (action === "change_project") {
    // Change to a different project and confirm
    const { error: updateErr } = await admin
      .from("email_records")
      .update({
        project_id: project_id,
        classification_status: "confirmed",
      } as Record<string, unknown>)
      .eq("id", email_id);

    if (updateErr) {
      console.error("[emails/confirm-classification] ERROR changing project:", updateErr.message);
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    // Add sender to the new project's email_senders
    await addSenderToProject(admin, email.sender_email, project_id!, userOrg?.organization_id);

    // Learn from correction
    if (userOrg?.organization_id) {
      const orgIdForLog = userOrg.organization_id;
      learnFromClassificationAction({
        supabase: admin,
        organizationId: orgIdForLog,
        senderEmail: email.sender_email,
        subject: email.subject || "",
        projectId: project_id!,
        action: "correct",
        previousProjectId: email.project_id,
        emailId: email.id,
        userId: user.id,
        originalClassification: email.classification_status || undefined,
        correctedClassification: "confirmed",
      }).catch((err) =>
        logLearningFailure(admin, {
          organizationId: orgIdForLog,
          module: "mail",
          error: err,
          context: { op: "learnFromClassificationAction", action: "correct" },
        })
      );
    }

    if (process.env.NODE_ENV === "development") console.log("[emails/confirm-classification] Email reassigned to project:", project_id, "email:", email_id);
    return NextResponse.json({ success: true });
  }

  if (action === "reject") {
    // Reject the classification entirely
    const { error: updateErr } = await admin
      .from("email_records")
      .update({
        classification_status: "rejected",
        classification: null,
        project_id: null,
      } as Record<string, unknown>)
      .eq("id", email_id);

    if (updateErr) {
      console.error("[emails/confirm-classification] ERROR rejecting:", updateErr.message);
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    // Learn from rejection
    if (userOrg?.organization_id) {
      const orgIdForLog = userOrg.organization_id;
      learnFromClassificationAction({
        supabase: admin,
        organizationId: orgIdForLog,
        senderEmail: email.sender_email,
        subject: email.subject || "",
        projectId: null,
        action: "reject",
        emailId: email.id,
        userId: user.id,
        originalClassification: email.classification_status || undefined,
        correctedClassification: "rejected",
      }).catch((err) =>
        logLearningFailure(admin, {
          organizationId: orgIdForLog,
          module: "mail",
          error: err,
          context: { op: "learnFromClassificationAction", action: "reject" },
        })
      );
    }

    if (process.env.NODE_ENV === "development") console.log("[emails/confirm-classification] Email classification rejected:", email_id);
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

/**
 * Helper: adds a sender email to a project's email_senders array (if not already present).
 *
 * AUDIT 08/2026 — l'update n'était pas vérifié ({error} ignoré, supabase-js ne
 * throw pas) : un expéditeur jamais ajouté = la boucle "expéditeur confirmé →
 * classification locale gratuite" ne se fermait pas, sans aucune trace.
 */
async function addSenderToProject(
  admin: ReturnType<typeof createAdminClient>,
  senderEmail: string | null,
  projectId: string,
  organizationId?: string | null
) {
  if (!senderEmail) return;

  try {
    const { data: project } = await admin
      .from("projects")
      .select("email_senders")
      .eq("id", projectId)
      .maybeSingle();

    if (project) {
      const currentSenders: string[] = (project as Record<string, unknown>).email_senders as string[] || [];
      const normalizedSender = senderEmail.toLowerCase();
      if (!currentSenders.includes(normalizedSender)) {
        const updatedSenders = [...currentSenders, normalizedSender];
        const { error: updateError } = await admin
          .from("projects")
          .update({ email_senders: updatedSenders } as Record<string, unknown>)
          .eq("id", projectId);
        if (updateError && organizationId) {
          await logLearningFailure(admin, {
            organizationId,
            module: "mail",
            error: updateError,
            context: { table: "projects", op: "email_senders_append", project_id: projectId },
          });
        }
        if (process.env.NODE_ENV === "development") console.log(`[emails/confirm-classification] Added sender "${normalizedSender}" to project ${projectId}`);
      }
    }
  } catch (err) {
    if (organizationId) {
      await logLearningFailure(admin, {
        organizationId,
        module: "mail",
        error: err,
        context: { table: "projects", op: "email_senders_append", project_id: projectId },
      });
    } else {
      console.error("[emails/confirm-classification] Failed to update project email_senders:", err);
    }
  }
}
