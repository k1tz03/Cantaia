import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/tasks/by-email?email_id=...
 * Returns tasks created from a specific email.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const emailId = request.nextUrl.searchParams.get("email_id");
  if (!emailId) {
    return NextResponse.json({ error: "email_id required" }, { status: 400 });
  }

  const adminClient = createAdminClient();

  // Scope to the caller's organization — the admin client bypasses RLS, so
  // without this any authenticated user could read another org's tasks.
  const { data: userProfile } = await (adminClient as any)
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!userProfile?.organization_id) {
    return NextResponse.json({ error: "No organization" }, { status: 403 });
  }

  const { data: tasks, error } = await (adminClient as any)
    .from("tasks")
    .select("id, title, assigned_to_name, due_date, priority, status, projects!inner(organization_id)")
    .eq("projects.organization_id", userProfile.organization_id)
    .eq("source", "email")
    .eq("source_id", emailId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Strip the join artefact before returning
  const cleaned = (tasks || []).map(({ projects: _projects, ...task }: any) => task);

  return NextResponse.json({ tasks: cleaned });
}
