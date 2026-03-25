import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/user/onboarding — check onboarding status & progress
 * Returns all context needed for the 6-step wizard in a single call.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  // Fetch core profile fields (always available)
  const { data: profile } = await (admin as any)
    .from("users")
    .select("onboarding_completed, organization_id, microsoft_access_token, first_name, last_name, email, job_title, preferred_language")
    .eq("id", user.id)
    .maybeSingle();

  const orgId = (profile as any)?.organization_id;

  // Fetch new onboarding columns (may not exist if migration 065 not applied)
  let currentStep = 1;
  let onboardingData = {};
  let companySize: string | null = null;
  let projectTypes: string[] = [];
  try {
    const { data: extProfile } = await (admin as any)
      .from("users")
      .select("onboarding_current_step, onboarding_data, company_size, project_types")
      .eq("id", user.id)
      .maybeSingle();
    if (extProfile) {
      currentStep = extProfile.onboarding_current_step ?? 1;
      onboardingData = extProfile.onboarding_data ?? {};
      companySize = extProfile.company_size ?? null;
      projectTypes = extProfile.project_types ?? [];
    }
  } catch {
    // Migration 065 not applied yet — use defaults
  }

  // Fetch org name
  let orgName: string | null = null;
  if (orgId) {
    try {
      const { data: org } = await admin
        .from("organizations")
        .select("name")
        .eq("id", orgId)
        .maybeSingle();
      orgName = org?.name ?? null;
    } catch {
      // Org fetch failed
    }
  }

  // Check email connection
  const { count: emailConnCount } = await admin
    .from("email_connections")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("status", "active");

  const hasEmailConnection = (emailConnCount || 0) > 0 || !!(profile as any)?.microsoft_access_token;

  // Count email_records for org
  let emailCount = 0;
  if (orgId) {
    try {
      const { count } = await (admin as any)
        .from("email_records")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId);
      emailCount = count || 0;
    } catch {
      // email_records may not have organization_id — try user_id
      try {
        const { count } = await admin
          .from("email_records")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id);
        emailCount = count || 0;
      } catch {
        // Fallback: 0
      }
    }
  }

  // Check projects
  let hasProject = false;
  let projectCount = 0;
  if (orgId) {
    const { count: projCount } = await admin
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId);
    projectCount = projCount || 0;
    hasProject = projectCount > 0;
  }

  return NextResponse.json({
    // Existing fields (backward compat)
    onboarding_completed: (profile as any)?.onboarding_completed ?? false,
    has_email_connection: hasEmailConnection,
    has_project: hasProject,
    organization_id: orgId,
    // New fields for 6-step wizard
    current_step: currentStep,
    onboarding_data: onboardingData,
    user_profile: {
      first_name: (profile as any)?.first_name ?? "",
      last_name: (profile as any)?.last_name ?? "",
      email: (profile as any)?.email ?? user.email ?? "",
      job_title: (profile as any)?.job_title ?? "",
      company_size: companySize,
      project_types: projectTypes,
      preferred_language: (profile as any)?.preferred_language ?? "fr",
    },
    org_name: orgName,
    email_count: emailCount,
    project_count: projectCount,
  });
}

/**
 * PATCH /api/user/onboarding — update onboarding state
 * Accepts partial updates:
 *   - step: number → updates onboarding_current_step
 *   - data: object → merges into onboarding_data
 *   - profile_updates: { first_name?, last_name?, job_title?, company_size?, project_types? }
 *   - org_name: string → updates organizations.name
 *   - complete: true → sets onboarding_completed: true
 */
export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Handle completion (backward compat — original PATCH behavior)
  if (body.complete === true || body.onboarding_completed === true) {
    const { error } = await (admin as any)
      .from("users")
      .update({ onboarding_completed: true })
      .eq("id", user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  // Update step
  if (typeof body.step === "number") {
    try {
      await (admin as any)
        .from("users")
        .update({ onboarding_current_step: body.step })
        .eq("id", user.id);
    } catch (err) {
      console.warn("[onboarding] Failed to update step (migration 065 not applied?):", err);
    }
  }

  // Merge onboarding_data
  if (body.data && typeof body.data === "object") {
    try {
      // Fetch existing onboarding_data, then merge
      const { data: existing } = await (admin as any)
        .from("users")
        .select("onboarding_data")
        .eq("id", user.id)
        .maybeSingle();

      const existingData = existing?.onboarding_data ?? {};
      const merged = { ...existingData, ...(body.data as Record<string, unknown>) };

      await (admin as any)
        .from("users")
        .update({ onboarding_data: merged })
        .eq("id", user.id);
    } catch (err) {
      console.warn("[onboarding] Failed to merge onboarding_data (migration 065 not applied?):", err);
    }
  }

  // Update profile fields
  if (body.profile_updates && typeof body.profile_updates === "object") {
    const pu = body.profile_updates as Record<string, unknown>;
    const userUpdate: Record<string, unknown> = {};

    if (typeof pu.first_name === "string") userUpdate.first_name = pu.first_name;
    if (typeof pu.last_name === "string") userUpdate.last_name = pu.last_name;
    if (typeof pu.job_title === "string") userUpdate.job_title = pu.job_title;

    // These columns are from migration 065 — may not exist
    if (typeof pu.company_size === "string") userUpdate.company_size = pu.company_size;
    if (Array.isArray(pu.project_types)) userUpdate.project_types = pu.project_types;

    if (Object.keys(userUpdate).length > 0) {
      try {
        const { error } = await (admin as any)
          .from("users")
          .update(userUpdate)
          .eq("id", user.id);
        if (error) {
          console.warn("[onboarding] Failed to update profile:", error.message);
        }
      } catch (err) {
        console.warn("[onboarding] Failed to update profile (column missing?):", err);
      }
    }
  }

  // Update org name
  if (typeof body.org_name === "string" && body.org_name.trim()) {
    try {
      // Get user's org
      const { data: userRow } = await (admin as any)
        .from("users")
        .select("organization_id")
        .eq("id", user.id)
        .maybeSingle();

      if (userRow?.organization_id) {
        const { error } = await admin
          .from("organizations")
          .update({ name: body.org_name.trim() } as any)
          .eq("id", userRow.organization_id);
        if (error) {
          console.warn("[onboarding] Failed to update org name:", error.message);
        }
      }
    } catch (err) {
      console.warn("[onboarding] Failed to update org name:", err);
    }
  }

  return NextResponse.json({ success: true });
}
