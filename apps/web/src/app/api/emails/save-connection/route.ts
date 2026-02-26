import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptPassword } from "@cantaia/core/emails";
import { parseBody, validateRequired } from "@/lib/api/parse-body";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminClient = createAdminClient();

  const { data: body, error: parseError } = await parseBody(request);
  if (parseError || !body) {
    return NextResponse.json({ error: parseError || "Invalid request" }, { status: 400 });
  }

  const validationError = validateRequired(body, ["provider", "imap_host", "imap_password", "email_address"]);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const { provider, imap_host, imap_port, imap_security, imap_username, imap_password, smtp_host, smtp_port, smtp_security, smtp_username, smtp_password, email_address, display_name } = body;

  if (provider !== "imap") {
    return NextResponse.json({ error: "Only IMAP connections can be saved via this route" }, { status: 400 });
  }

  // Get user's organization
  const { data: userProfile } = await adminClient
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!userProfile?.organization_id) {
    return NextResponse.json({ error: "No organization found" }, { status: 400 });
  }

  // Delete existing connections for this user
  await adminClient
    .from("email_connections")
    .delete()
    .eq("user_id", user.id);

  // Insert new IMAP connection
  const { data: connection, error } = await adminClient
    .from("email_connections")
    .insert({
      user_id: user.id,
      organization_id: userProfile.organization_id,
      provider: "imap",
      imap_host,
      imap_port: imap_port || 993,
      imap_security: imap_security || "ssl",
      imap_username: imap_username || email_address,
      imap_password_encrypted: encryptPassword(imap_password),
      smtp_host: smtp_host || imap_host,
      smtp_port: smtp_port || 587,
      smtp_security: smtp_security || "tls",
      smtp_username: smtp_username || imap_username || email_address,
      smtp_password_encrypted: encryptPassword(smtp_password || imap_password),
      email_address,
      display_name: display_name || null,
      status: "active",
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, connection });
}

export async function DELETE() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminClient = createAdminClient();

  await adminClient
    .from("email_connections")
    .delete()
    .eq("user_id", user.id);

  // Also clear legacy Microsoft tokens
  await adminClient
    .from("users")
    .update({
      microsoft_access_token: null,
      microsoft_refresh_token: null,
      microsoft_token_expires_at: null,
      outlook_sync_enabled: false,
    })
    .eq("id", user.id);

  return NextResponse.json({ success: true });
}
