import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/email/[id]/move
 * Move an email to a specific Outlook folder.
 * Body: { folder_id: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { folder_id: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.folder_id) {
    return NextResponse.json({ error: "folder_id is required" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Get the email's provider message ID
  const { data: email } = await (admin as any)
    .from("email_records")
    .select("id, provider_message_id, outlook_message_id, user_id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!email) {
    return NextResponse.json({ error: "Email not found" }, { status: 404 });
  }

  const messageId = email.provider_message_id || email.outlook_message_id;
  if (!messageId) {
    return NextResponse.json({ error: "No provider message ID" }, { status: 400 });
  }

  // Get Microsoft token
  const { data: userRow } = await (admin as any)
    .from("users")
    .select("microsoft_access_token")
    .eq("id", user.id)
    .maybeSingle();

  if (!(userRow as any)?.microsoft_access_token) {
    return NextResponse.json({ error: "No Microsoft connection" }, { status: 400 });
  }

  try {
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(messageId)}/move`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${(userRow as any).microsoft_access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ destinationId: body.folder_id }),
      }
    );

    if (!res.ok) {
      return NextResponse.json({ error: "Move failed" }, { status: res.status });
    }

    // Update local record
    await (admin as any)
      .from("email_records")
      .update({ outlook_folder_moved: body.folder_id })
      .eq("id", id);

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: `Move failed: ${err instanceof Error ? err.message : "Unknown"}` },
      { status: 500 }
    );
  }
}
