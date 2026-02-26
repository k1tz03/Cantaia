import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getEmailProvider } from "@cantaia/core/emails";
import type { EmailConnectionConfig } from "@cantaia/core/emails";
import { parseBody, validateRequired } from "@/lib/api/parse-body";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: body, error: parseError } = await parseBody(request);
  if (parseError || !body) {
    return NextResponse.json({ error: parseError || "Invalid request" }, { status: 400 });
  }

  const validationError = validateRequired(body, ["provider", "imap_host", "imap_password", "email_address"]);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const { provider, imap_host, imap_port, imap_security, imap_username, imap_password, smtp_host, smtp_port, smtp_security, smtp_username, smtp_password, email_address } = body;

  if (provider !== "imap") {
    return NextResponse.json({ error: "Only IMAP test is supported" }, { status: 400 });
  }

  // Build a temporary connection object for testing
  const { encryptPassword } = await import("@cantaia/core/emails");

  const testConnection: EmailConnectionConfig = {
    id: "test",
    user_id: user.id,
    organization_id: "",
    provider: "imap",
    oauth_access_token: null,
    oauth_refresh_token: null,
    oauth_token_expires_at: null,
    oauth_scopes: null,
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
    display_name: null,
    status: "active",
    last_sync_at: null,
    total_emails_synced: 0,
    sync_folder: "INBOX",
  };

  const imapProvider = getEmailProvider("imap");
  const result = await imapProvider.testConnection(testConnection);

  return NextResponse.json(result);
}
