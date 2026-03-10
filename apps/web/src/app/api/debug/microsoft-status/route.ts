import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/debug/microsoft-status
 * Diagnostic endpoint — returns the full state of the Microsoft connection
 * for the current authenticated user. Helps debug disconnection issues.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({
      auth: "NOT_AUTHENTICATED",
      message: "Supabase session is invalid — user is logged out",
    });
  }

  const admin = createAdminClient();

  // 1. Check users table
  const { data: userRow, error: userError } = await admin
    .from("users")
    .select("id, email, organization_id, microsoft_access_token, microsoft_refresh_token, microsoft_token_expires_at, outlook_sync_enabled, auth_provider, last_sync_at")
    .eq("id", user.id)
    .maybeSingle();

  // 2. Check ALL email_connections (not just active)
  const { data: connections, error: connError } = await admin
    .from("email_connections")
    .select("id, provider, email_address, status, oauth_access_token, oauth_refresh_token, oauth_token_expires_at, last_sync_at, total_emails_synced, sync_delta_link, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  // 3. Count email_records
  const { count: emailCount } = await admin
    .from("email_records")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  // 4. Check if there are email_records under DIFFERENT user IDs with same email
  const { data: otherRecords } = await admin
    .from("email_records")
    .select("user_id", { count: "exact", head: true })
    .eq("sender_email", user.email || "")
    .neq("user_id", user.id)
    .limit(1);

  // 5. Check if there are other users rows with same email
  const { data: otherUsers } = await admin
    .from("users")
    .select("id, email, organization_id, auth_provider")
    .eq("email", user.email || "")
    .neq("id", user.id);

  // 6. Check auth identities
  const identities = user.identities?.map((i) => ({
    provider: i.provider,
    identity_id: i.id,
    created_at: i.created_at,
  }));

  const now = new Date();

  return NextResponse.json({
    timestamp: now.toISOString(),
    auth: {
      user_id: user.id,
      email: user.email,
      identities,
      session_valid: true,
    },
    users_table: userError
      ? { error: userError.message }
      : userRow
        ? {
            exists: true,
            organization_id: userRow.organization_id,
            auth_provider: userRow.auth_provider,
            outlook_sync_enabled: userRow.outlook_sync_enabled,
            has_access_token: !!userRow.microsoft_access_token,
            has_refresh_token: !!userRow.microsoft_refresh_token,
            token_expires_at: userRow.microsoft_token_expires_at,
            token_expired: userRow.microsoft_token_expires_at
              ? new Date(userRow.microsoft_token_expires_at) < now
              : null,
            last_sync_at: userRow.last_sync_at,
          }
        : { exists: false, message: "NO ROW in users table for this auth user ID!" },
    email_connections: connError
      ? { error: connError.message }
      : {
          total: connections?.length || 0,
          records: (connections || []).map((c) => ({
            id: c.id,
            provider: c.provider,
            email_address: c.email_address,
            status: c.status,
            has_access_token: !!c.oauth_access_token,
            has_refresh_token: !!c.oauth_refresh_token,
            token_expires_at: c.oauth_token_expires_at,
            token_expired: c.oauth_token_expires_at
              ? new Date(c.oauth_token_expires_at) < now
              : null,
            last_sync_at: c.last_sync_at,
            total_emails_synced: c.total_emails_synced,
            has_delta_link: !!c.sync_delta_link,
            created_at: c.created_at,
          })),
        },
    email_records: {
      count_for_this_user: emailCount || 0,
      has_records_under_other_user_ids: (otherRecords?.length || 0) > 0,
    },
    other_users_with_same_email: (otherUsers || []).map((u) => ({
      id: u.id,
      auth_provider: u.auth_provider,
      organization_id: u.organization_id,
    })),
    diagnosis: getDiagnosis(userRow, connections, emailCount),
  });
}

function getDiagnosis(
  userRow: any,
  connections: any[] | null,
  emailCount: number | null
): string {
  const issues: string[] = [];

  if (!userRow) {
    issues.push("CRITICAL: No users table row — auth user exists but profile is missing");
  }

  const activeConns = (connections || []).filter((c: any) => c.status === "active");
  if (activeConns.length === 0) {
    issues.push("NO active email_connections — this is why /mail shows 'connect email'");
    if ((connections || []).length > 0) {
      const statuses = (connections || []).map((c: any) => c.status);
      issues.push(`Found ${connections?.length} connections but with statuses: ${statuses.join(", ")}`);
    }
  }

  if (userRow && !userRow.microsoft_access_token) {
    issues.push("No legacy microsoft_access_token in users table");
  }

  if (userRow && !userRow.outlook_sync_enabled) {
    issues.push("outlook_sync_enabled is false in users table");
  }

  if ((emailCount || 0) === 0) {
    issues.push("Zero email_records for this user — either never synced or data is under a different user ID");
  }

  if (issues.length === 0) {
    return "Everything looks OK — connection and tokens are present";
  }

  return issues.join(" | ");
}
