import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/admin/clients
 * Returns all members of the authenticated user's organization.
 * Uses admin client to bypass RLS (avoids users table recursion).
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Get user's org
  const { data: profile } = await admin
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.organization_id) {
    return NextResponse.json({ members: [] });
  }

  // Get org info
  const { data: org } = await admin
    .from("organizations")
    .select("max_users")
    .eq("id", profile.organization_id)
    .maybeSingle();

  // Get all members
  const { data: members } = await admin
    .from("users")
    .select("id, first_name, last_name, email, role, is_active, created_at")
    .eq("organization_id", profile.organization_id)
    .order("created_at", { ascending: true });

  return NextResponse.json({
    members: members || [],
    max_users: org?.max_users || 20,
    organization_id: profile.organization_id,
  });
}
