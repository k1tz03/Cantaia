import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logActivityAsync } from "@cantaia/core/tracking";
import { parseBody, validateRequired } from "@/lib/api/parse-body";

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

  return NextResponse.json({ success: true, project });
}
