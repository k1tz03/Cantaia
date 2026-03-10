import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/user/onboarding — check onboarding status & progress
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  const { data: profile } = await (admin as any)
    .from("users")
    .select("onboarding_completed, organization_id, microsoft_access_token")
    .eq("id", user.id)
    .maybeSingle();

  const orgId = (profile as any)?.organization_id;

  // Check email connection
  const { count: emailCount } = await admin
    .from("email_connections")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("status", "active");

  const hasEmailConnection = (emailCount || 0) > 0 || !!(profile as any)?.microsoft_access_token;

  // Check projects
  let hasProject = false;
  if (orgId) {
    const { count: projCount } = await admin
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId);
    hasProject = (projCount || 0) > 0;
  }

  return NextResponse.json({
    onboarding_completed: (profile as any)?.onboarding_completed ?? false,
    has_email_connection: hasEmailConnection,
    has_project: hasProject,
    organization_id: orgId,
  });
}

/**
 * PATCH /api/user/onboarding — mark onboarding as completed
 */
export async function PATCH() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { error } = await admin
    .from("users")
    .update({ onboarding_completed: true } as any)
    .eq("id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
