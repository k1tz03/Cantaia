import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/emails/inbox
 * Returns all emails for the authenticated user, bypassing RLS via admin client.
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

  const { data: emails, error } = await admin
    .from("emails")
    .select("*")
    .eq("user_id", user.id)
    .order("received_at", { ascending: false })
    .limit(500);

  if (error) {
    console.error("[emails/inbox] Error:", error.message);
    return NextResponse.json({ error: "Failed to fetch emails" }, { status: 500 });
  }

  return NextResponse.json({ emails: emails || [] });
}
