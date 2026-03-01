import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * PATCH /api/email/[id]/snooze
 * Snooze an email until a specific time.
 * Body: { until: ISO string }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { until: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.until) {
    return NextResponse.json({ error: "until is required" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { error } = await (admin as any)
    .from("email_records")
    .update({
      triage_status: "snoozed",
      snooze_until: body.until,
      process_action: "snoozed",
    })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, snooze_until: body.until });
}
