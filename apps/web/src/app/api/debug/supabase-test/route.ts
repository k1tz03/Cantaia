import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/debug/supabase-test
 * Diagnostic route to verify Supabase connectivity, user state, and RLS policies.
 * Restricted to superadmin users only.
 */
export async function GET() {
  // Auth: require superadmin
  const supabaseAuth = await createClient();
  const { data: { user: authUser } } = await supabaseAuth.auth.getUser();
  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const adminCheck = createAdminClient();
  const { data: adminRow } = await adminCheck
    .from("users")
    .select("is_superadmin")
    .eq("id", authUser.id)
    .maybeSingle();
  if (!adminRow?.is_superadmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const results: Record<string, unknown> = {};

  // 1. Check admin client connection
  try {
    const admin = createAdminClient();
    const { count, error } = await admin
      .from("organizations")
      .select("*", { count: "exact", head: true });
    results.admin_connection = error
      ? { ok: false, error: error.message }
      : { ok: true, organizations_count: count };
    console.log("[debug/supabase-test] Admin connection:", results.admin_connection);
  } catch (err) {
    results.admin_connection = { ok: false, error: String(err) };
    console.error("[debug/supabase-test] Admin connection error:", err);
  }

  // 2. Check authenticated user via SSR client
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) {
      results.auth_user = { ok: false, error: error.message };
    } else if (!user) {
      results.auth_user = { ok: false, error: "No user session found" };
    } else {
      results.auth_user = { ok: true, user_id: user.id, email: user.email };
    }
    console.log("[debug/supabase-test] Auth user:", results.auth_user);

    // 3. Check user row in users table
    if (user) {
      const admin = createAdminClient();
      const { data: userRow, error: userErr } = await admin
        .from("users")
        .select("id, email, first_name, last_name, role, organization_id")
        .eq("id", user.id)
        .maybeSingle();

      if (userErr) {
        results.user_row = { ok: false, error: userErr.message };
      } else if (!userRow) {
        results.user_row = { ok: false, error: "User not found in users table" };
      } else {
        results.user_row = { ok: true, ...userRow };
      }
      console.log("[debug/supabase-test] User row:", results.user_row);

      // 4. Check organization
      if (userRow?.organization_id) {
        const { data: org, error: orgErr } = await admin
          .from("organizations")
          .select("id, name, subscription_plan, is_active, max_projects")
          .eq("id", userRow.organization_id)
          .maybeSingle();
        results.organization = orgErr
          ? { ok: false, error: orgErr.message }
          : { ok: true, ...org };
        console.log("[debug/supabase-test] Organization:", results.organization);
      } else {
        results.organization = { ok: false, error: "User has no organization_id — projects cannot be created" };
      }

      // 5. Check projects count
      const { count: projectsCount, error: projErr } = await admin
        .from("projects")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", userRow?.organization_id || "none");
      results.projects = projErr
        ? { ok: false, error: projErr.message }
        : { ok: true, count: projectsCount };
      console.log("[debug/supabase-test] Projects:", results.projects);

      // 6. Check email_records count
      const { count: emailsCount, error: emailErr } = await admin
        .from("emails")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id);
      results.emails = emailErr
        ? { ok: false, error: emailErr.message }
        : { ok: true, count: emailsCount };
      console.log("[debug/supabase-test] Emails:", results.emails);

      // 7. Test RLS — try SSR client SELECT on projects
      try {
        const { data: rlsProjects, error: rlsErr } = await supabase
          .from("projects")
          .select("id, name")
          .limit(5);
        results.rls_select_projects = rlsErr
          ? { ok: false, error: rlsErr.message }
          : { ok: true, count: rlsProjects?.length || 0, sample: rlsProjects?.map(p => (p as any).name) };
      } catch (err) {
        results.rls_select_projects = { ok: false, error: String(err) };
      }
      console.log("[debug/supabase-test] RLS SELECT projects:", results.rls_select_projects);

      // 8. Test RLS — try SSR client SELECT on email_records
      try {
        const { data: rlsEmails, error: rlsErr } = await supabase
          .from("emails")
          .select("id, subject")
          .limit(3);
        results.rls_select_emails = rlsErr
          ? { ok: false, error: rlsErr.message }
          : { ok: true, count: rlsEmails?.length || 0 };
      } catch (err) {
        results.rls_select_emails = { ok: false, error: String(err) };
      }
      console.log("[debug/supabase-test] RLS SELECT emails:", results.rls_select_emails);

      // 9. Check Microsoft token
      results.microsoft_token = {
        has_access_token: !!userRow?.organization_id && !!(await admin.from("users").select("microsoft_access_token").eq("id", user.id).maybeSingle()).data?.microsoft_access_token,
      };

      // 10. Check ANTHROPIC_API_KEY (do NOT expose key prefix)
      results.anthropic_key = {
        configured: !!process.env.ANTHROPIC_API_KEY,
      };
    }
  } catch (err) {
    results.auth_user = { ok: false, error: String(err) };
    console.error("[debug/supabase-test] Auth error:", err);
  }

  console.log("[debug/supabase-test] Full results:", JSON.stringify(results, null, 2));
  return NextResponse.json(results);
}
