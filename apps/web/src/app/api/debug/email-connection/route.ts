import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/debug/email-connection
 * Diagnostic endpoint to debug email connection detection.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({
        step: "auth",
        error: authError?.message || "No user",
        fix: "User is not authenticated",
      });
    }

    const adminClient = createAdminClient();

    // Restrict to superadmin
    const { data: adminRow } = await adminClient
      .from("users")
      .select("is_superadmin")
      .eq("id", user.id)
      .maybeSingle();
    if (!adminRow?.is_superadmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Check users table
    const { data: profile, error: profileError } = await adminClient
      .from("users")
      .select(
        "id, organization_id, email, microsoft_access_token, microsoft_refresh_token, microsoft_token_expires_at, outlook_sync_enabled"
      )
      .eq("id", user.id)
      .maybeSingle();

    // Check email_connections table
    let emailConn = null;
    let emailConnError = null;
    try {
      const res = await (adminClient as any)
        .from("email_connections")
        .select("id, user_id, provider, email_address, status, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(5);
      emailConn = res.data;
      emailConnError = res.error?.message || null;
    } catch (e: any) {
      emailConnError = e?.message || "table may not exist";
    }

    return NextResponse.json({
      auth_user_id: user.id,
      auth_email: user.email,
      users_row_exists: !!profile,
      users_row: profile
        ? {
            id: profile.id,
            organization_id: profile.organization_id,
            email: profile.email,
            has_microsoft_token: !!profile.microsoft_access_token,
            token_expires_at: profile.microsoft_token_expires_at,
            outlook_sync_enabled: profile.outlook_sync_enabled,
          }
        : null,
      users_query_error: profileError?.message || null,
      email_connections: emailConn,
      email_connections_error: emailConnError,
    });
  } catch (err: any) {
    return NextResponse.json({ fatal_error: err?.message }, { status: 500 });
  }
}
