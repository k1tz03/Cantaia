import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEmailProvider, isTokenExpired, type EmailConnectionConfig } from "@cantaia/core/emails";
import { parseBody, validateRequired } from "@/lib/api/parse-body";

/**
 * POST /api/email/send
 * Send, reply to, or forward an email via the user's connected provider.
 * Body: {
 *   to: string[],
 *   cc?: string[],
 *   subject: string,
 *   body: string (HTML),
 *   reply_to_id?: string (provider message ID for reply),
 *   forward_id?: string (provider message ID for forward),
 * }
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: body, error: parseError } = await parseBody(request);
  if (parseError || !body) {
    return NextResponse.json({ error: parseError || "Invalid request" }, { status: 400 });
  }

  const requiredError = validateRequired(body, ["to", "subject", "body"]);
  if (requiredError) {
    return NextResponse.json({ error: requiredError }, { status: 400 });
  }

  const { to, cc, subject, body: emailBody, reply_to_id, forward_id } = body as {
    to: string[];
    cc?: string[];
    subject: string;
    body: string;
    reply_to_id?: string;
    forward_id?: string;
  };

  const admin = createAdminClient();

  // Get user's active email connection
  const { data: connection } = await (admin as any)
    .from("email_connections")
    .select("*")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!connection) {
    return NextResponse.json({ error: "No active email connection" }, { status: 400 });
  }

  const provider = getEmailProvider(connection.provider);

  // Refresh token if needed
  if ((connection.provider === "microsoft" || connection.provider === "google") &&
      isTokenExpired(connection.oauth_token_expires_at) &&
      provider.refreshToken) {
    try {
      const tokens = await provider.refreshToken(connection as EmailConnectionConfig);
      await (admin as any)
        .from("email_connections")
        .update({
          oauth_access_token: tokens.access_token,
          oauth_refresh_token: tokens.refresh_token || connection.oauth_refresh_token,
          oauth_token_expires_at: tokens.expires_in
            ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
            : connection.oauth_token_expires_at,
        })
        .eq("id", connection.id);
      connection.oauth_access_token = tokens.access_token;
    } catch (err) {
      return NextResponse.json({ error: `Token refresh failed: ${err instanceof Error ? err.message : "Unknown"}` }, { status: 500 });
    }
  }

  try {
    if (reply_to_id) {
      // Reply to an existing email
      await provider.replyToEmail(connection as EmailConnectionConfig, reply_to_id, {
        to,
        cc,
        subject,
        bodyHtml: emailBody,
      });
    } else if (forward_id) {
      // Forward uses the same sendEmail with the forwarded body
      await provider.sendEmail(connection as EmailConnectionConfig, {
        to,
        cc,
        subject,
        bodyHtml: emailBody,
      });
    } else {
      // New email
      await provider.sendEmail(connection as EmailConnectionConfig, {
        to,
        cc,
        subject,
        bodyHtml: emailBody,
      });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[email/send] Error:", err);
    return NextResponse.json(
      { error: `Send failed: ${err instanceof Error ? err.message : "Unknown"}` },
      { status: 500 }
    );
  }
}
