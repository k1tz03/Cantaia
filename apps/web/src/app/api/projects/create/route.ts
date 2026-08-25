import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logActivityAsync } from "@cantaia/core/tracking";
import { parseBody, validateRequired } from "@/lib/api/parse-body";
import { grantCredits } from "@/lib/credits";
import { SIGNUP_BONUS_CREDITS } from "@cantaia/config/credit-costs";

/**
 * POST /api/projects/create
 * Creates a new project in Supabase with proper organization assignment and project_member creation.
 */
export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "development") console.log("[projects/create] Starting project creation...");

  // 1. Auth check
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    if (process.env.NODE_ENV === "development") console.log("[projects/create] ERROR: No authenticated user");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (process.env.NODE_ENV === "development") console.log("[projects/create] Authenticated user:", user.id, user.email);

  // 2. Get user's organization_id (auto-create profile if missing)
  const admin = createAdminClient();
  let { data: userRow } = await admin
    .from("users")
    .select("organization_id, first_name, last_name")
    .eq("id", user.id)
    .maybeSingle();

  if (!userRow) {
    if (process.env.NODE_ENV === "development") console.log("[projects/create] User profile missing, auto-creating...");
    // Auto-create organization + user profile from auth metadata
    const metadata = user.user_metadata || {};
    const fullName = metadata.full_name || metadata.name || user.email || "";
    const nameParts = fullName.split(" ");
    const firstName = metadata.first_name || nameParts[0] || "";
    const lastName = metadata.last_name || nameParts.slice(1).join(" ") || "";

    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 14);

    const { data: org, error: orgError } = await admin
      .from("organizations")
      .insert({
        name: metadata.company_name || `${firstName} ${lastName}`.trim() || "My Company",
        subscription_plan: "trial",
        trial_ends_at: trialEndsAt.toISOString(),
        max_users: 3,
        max_projects: 5,
      })
      .select()
      .single();

    if (orgError || !org) {
      console.error("[projects/create] Failed to create organization:", orgError?.message);
      return NextResponse.json({ error: "Failed to create organization" }, { status: 500 });
    }

    // Signup bonus — best effort, never blocks org creation (migration 090).
    try {
      const bonus = await grantCredits(org.id, SIGNUP_BONUS_CREDITS, "signup_bonus", "registration");
      if (!bonus.granted) {
        console.warn("[projects/create] Signup credit bonus not granted for org", org.id);
      }
    } catch (creditErr) {
      console.error("[projects/create] Signup credit bonus failed (non-fatal):", creditErr);
    }

    const { error: insertUserErr } = await admin.from("users").upsert({
      id: user.id,
      organization_id: org.id,
      email: user.email!,
      first_name: firstName,
      last_name: lastName,
      role: "project_manager",
      preferred_language: "fr",
    } as any, { onConflict: "id" });

    if (insertUserErr) {
      console.error("[projects/create] Failed to create user profile:", insertUserErr.message, insertUserErr.code, insertUserErr.details, insertUserErr.hint);
      return NextResponse.json({ error: "Failed to create user profile" }, { status: 500 });
    }

    // Re-fetch the user row
    const { data: newUserRow } = await admin
      .from("users")
      .select("organization_id, first_name, last_name")
      .eq("id", user.id)
      .maybeSingle();

    userRow = newUserRow;
    if (process.env.NODE_ENV === "development") console.log("[projects/create] Auto-created profile with org:", org.id);
  }

  if (!userRow?.organization_id) {
    if (process.env.NODE_ENV === "development") console.log("[projects/create] ERROR: User has no organization_id");
    return NextResponse.json(
      { error: "No organization associated with your account. Please contact support." },
      { status: 400 }
    );
  }
  if (process.env.NODE_ENV === "development") console.log("[projects/create] User org:", userRow.organization_id);

  // 3. Parse body
  const { data: body, error: parseError } = await parseBody(request);
  if (parseError || !body) {
    return NextResponse.json({ error: parseError || "Invalid request" }, { status: 400 });
  }

  const requiredError = validateRequired(body, ["name"]);
  if (requiredError) {
    if (process.env.NODE_ENV === "development") console.log("[projects/create] ERROR: Missing project name");
    return NextResponse.json({ error: "Project name is required" }, { status: 400 });
  }
  if (process.env.NODE_ENV === "development") console.log("[projects/create] Project data:", {
    name: body.name,
    code: body.code,
    city: body.city,
    status: body.status,
  });

  // 4. Check for duplicates (same name or same code in the same org)
  // Sanitize: remove PostgREST filter special characters to prevent injection
  const safeName = body.name.replace(/[%_,().]/g, "");
  const safeCode = body.code ? body.code.replace(/[%_,().]/g, "") : null;
  const { data: duplicate } = await admin
    .from("projects")
    .select("id, name, code")
    .eq("organization_id", userRow.organization_id)
    .or(
      `name.ilike.%${safeName}%${safeCode ? `,code.eq.${safeCode}` : ""}`
    )
    .limit(1)
    .maybeSingle();

  if (duplicate) {
    const reason = duplicate.name.toLowerCase() === body.name.toLowerCase()
      ? `Un projet nommé "${duplicate.name}" existe déjà`
      : `Un projet avec le code "${duplicate.code}" existe déjà`;
    if (process.env.NODE_ENV === "development") console.log("[projects/create] Duplicate found:", duplicate.id, reason);
    return NextResponse.json(
      { error: reason },
      { status: 409 }
    );
  }

  // 5. INSERT project using admin client (bypasses RLS)
  const projectData = {
    organization_id: userRow.organization_id,
    created_by: user.id,
    name: body.name,
    code: body.code || null,
    description: body.description || null,
    client_name: body.client_name || null,
    address: body.address || null,
    city: body.city || "Lausanne",
    status: body.status || "active",
    start_date: body.start_date || null,
    end_date: body.end_date || null,
    budget_total: body.budget_total && Number.isFinite(Number(body.budget_total)) ? Number(body.budget_total) : null,
    currency: body.currency || "CHF",
    color: body.color || "#6366F1",
    email_keywords: body.email_keywords || [],
    email_senders: body.email_senders || [],
  };

  if (process.env.NODE_ENV === "development") console.log("[projects/create] Inserting project:", JSON.stringify(projectData));

  const { data: project, error: insertErr } = await admin
    .from("projects")
    .insert(projectData)
    .select()
    .single();

  if (insertErr) {
    console.error("[projects/create] ERROR inserting project:", insertErr.message, insertErr.details, insertErr.hint);
    return NextResponse.json(
      { error: `Failed to create project: ${insertErr.message}` },
      { status: 500 }
    );
  }

  if (process.env.NODE_ENV === "development") console.log("[projects/create] Project created successfully:", project.id, project.name);

  // 5. INSERT project_member (creator as owner)
  const { error: memberErr } = await admin
    .from("project_members")
    .insert({
      project_id: project.id,
      user_id: user.id,
      role: "owner",
    });

  if (memberErr) {
    console.error("[projects/create] WARNING: Failed to create project_member:", memberErr.message);
    // Don't fail — the project was created, just log the warning
  } else {
    if (process.env.NODE_ENV === "development") console.log("[projects/create] Project member created: user", user.id, "as owner of", project.id);
  }

  logActivityAsync({
    supabase: admin,
    userId: user.id,
    organizationId: userRow.organization_id,
    action: "create_project",
    metadata: { project_id: project.id, project_name: body.name },
  });

  // Prospect visit → project conversion.
  //
  // This used to be a fire-and-forget fuzzy match on client_name against every
  // prospect visit of the org ("Dupont" converted "Dupont SA", "Dupont Immo"
  // and "Chez Dupont" all at once, and missed the visit entirely when the
  // project was named differently). The visit id is now explicit: the
  // "Convertir en projet" button on /visits/[id] sends source_visit_id.
  let conversion: ConversionResult | null = null;
  if (body.source_visit_id) {
    conversion = await linkVisitToProject(
      admin,
      userRow.organization_id,
      project.id,
      String(body.source_visit_id),
      user.id,
    );
  }

  return NextResponse.json({ success: true, project, conversion });
}

// ============================================================================
// Prospect conversion: link one visit to the project it produced
// ============================================================================

interface ConversionResult {
  visit_id: string;
  linked: boolean;
  tasks_created: number;
  error?: string;
}

/**
 * Attaches a prospect visit to the project it produced, then replays the task
 * generation that was skipped while the visit had no project.
 *
 * `tasks.project_id` is NOT NULL, so a prospect visit's report generates zero
 * tasks: the "Établir devis" task and every next step of the AI report are
 * dropped on the floor. Conversion is the moment they become creatable, so the
 * same createVisitTasks() used by generate-report is run here (idempotent — it
 * bails out if tasks already exist for that visit).
 */
async function linkVisitToProject(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  projectId: string,
  visitId: string,
  userId: string,
): Promise<ConversionResult> {
  const result: ConversionResult = { visit_id: visitId, linked: false, tasks_created: 0 };

  try {
    // Anti-IDOR: the visit must belong to the caller's organization.
    const { data: visit } = await (admin as any)
      .from("client_visits")
      .select("id, organization_id, project_id, client_name, visit_date, created_by, title, report")
      .eq("id", visitId)
      .maybeSingle();

    if (!visit || visit.organization_id !== orgId) {
      result.error = "Visite introuvable dans cette organisation";
      return result;
    }

    if (visit.project_id) {
      result.error = "Cette visite est déjà rattachée à un projet";
      return result;
    }

    const updates: Record<string, unknown> = {
      project_id: projectId,
      is_prospect: false,
      updated_at: new Date().toISOString(),
    };

    // prospect_converted / converted_project_id arrive with migration 064 —
    // retry without them rather than losing the project_id link.
    const { error: updateErr } = await (admin as any)
      .from("client_visits")
      .update({ ...updates, prospect_converted: true, converted_project_id: projectId })
      .eq("id", visitId);

    if (updateErr) {
      console.warn("[projects/create] Conversion columns missing, retrying minimal:", updateErr.message);
      const { error: retryErr } = await (admin as any)
        .from("client_visits")
        .update(updates)
        .eq("id", visitId);
      if (retryErr) {
        result.error = retryErr.message;
        return result;
      }
    }

    result.linked = true;

    // Replay the report's tasks now that a project exists to hang them on.
    if (visit.report) {
      const { createVisitTasks } = await import("@cantaia/core/visits");
      const taskResult = await createVisitTasks({
        admin,
        visit: {
          id: visitId,
          project_id: projectId,
          client_name: visit.client_name,
          visit_date: visit.visit_date,
          created_by: visit.created_by,
          title: visit.title,
        },
        report: visit.report,
        fallbackUserId: userId,
      });
      result.tasks_created =
        taskResult.createdTaskIds.length + (taskResult.quoteTaskId ? 1 : 0);
    }

    console.log(
      `[projects/create] Visit ${visitId} converted → project ${projectId} (${result.tasks_created} task(s))`,
    );
  } catch (err) {
    console.error("[projects/create] Visit conversion failed:", err);
    result.error = err instanceof Error ? err.message : "Conversion échouée";
  }

  return result;
}
