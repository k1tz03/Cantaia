import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/projects/list
 * Returns all projects for the authenticated user's organization.
 * Uses admin client to bypass RLS.
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

  // Get user's organization
  const { data: userRow } = await admin
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!userRow?.organization_id) {
    return NextResponse.json({ projects: [] });
  }

  const { data: projects, error } = await admin
    .from("projects")
    .select("*")
    .eq("organization_id", userRow.organization_id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[projects/list] Error:", error.message);
    return NextResponse.json({ projects: [] });
  }

  return NextResponse.json({ projects: projects || [] });
}
