import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminClient = createAdminClient();

  // Try by user_id first
  const { data: connection } = await adminClient
    .from("email_connections")
    .select("provider, email_address, status, last_sync_at, total_emails_synced")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (connection) {
    return NextResponse.json({ connection });
  }

  // Fallback: search by organization (handles split identity case where
  // connection was saved under a different auth user in the same org)
  const { data: profile } = await adminClient
    .from("users")
    .select("organization_id, microsoft_access_token, microsoft_refresh_token, microsoft_token_expires_at, email")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.organization_id) {
    const { data: orgConnection } = await adminClient
      .from("email_connections")
      .select("provider, email_address, status, last_sync_at, total_emails_synced")
      .eq("organization_id", profile.organization_id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (orgConnection) {
      return NextResponse.json({ connection: orgConnection });
    }

    // If Microsoft tokens exist in users table, user IS connected even if
    // email_connections table is missing or INSERT fails.
    if (profile.microsoft_access_token) {
      // Try to auto-create email_connection row
      try {
        const { data: newConn } = await (adminClient as any)
          .from("email_connections")
          .insert({
            user_id: user.id,
            organization_id: profile.organization_id,
            provider: "microsoft",
            oauth_access_token: profile.microsoft_access_token,
            oauth_refresh_token: profile.microsoft_refresh_token || null,
            oauth_token_expires_at: profile.microsoft_token_expires_at || null,
            email_address: profile.email || user.email || "",
            status: "active",
          })
          .select("provider, email_address, status, last_sync_at, total_emails_synced")
          .single();

        if (newConn) {
          console.log("[get-connection] Auto-created email_connection for user:", user.id);
          return NextResponse.json({ connection: newConn });
        }
      } catch (err) {
        console.warn("[get-connection] email_connections insert failed (table may not exist):", err);
      }

      // Return synthetic connection from users table tokens
      return NextResponse.json({
        connection: {
          provider: "microsoft",
          email_address: profile.email || user.email || "",
          status: "active",
          last_sync_at: null,
          total_emails_synced: 0,
        },
      });
    }
  }

  // Also check users table directly (without org check) for microsoft tokens
  if (!profile?.organization_id) {
    const { data: userOnly } = await adminClient
      .from("users")
      .select("microsoft_access_token, email")
      .eq("id", user.id)
      .maybeSingle();

    if (userOnly?.microsoft_access_token) {
      return NextResponse.json({
        connection: {
          provider: "microsoft",
          email_address: userOnly.email || user.email || "",
          status: "active",
          last_sync_at: null,
          total_emails_synced: 0,
        },
      });
    }
  }

  return NextResponse.json({ connection: null });
}
