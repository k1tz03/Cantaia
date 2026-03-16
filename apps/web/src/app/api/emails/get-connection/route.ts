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
    .select("organization_id")
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

    return NextResponse.json({ connection: orgConnection || null });
  }

  return NextResponse.json({ connection: null });
}
