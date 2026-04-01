import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEmailProvider, isTokenExpired, type EmailConnectionConfig } from "@cantaia/core/emails";

/**
 * POST /api/email/send
 * Send, reply to, or forward an email via the user's connected provider.
 *
 * Accepts EITHER:
 *  - JSON body: { to, cc?, bcc?, subject, body, reply_to_id?, forward_id? }
 *  - FormData: same fields as JSON strings + "attachments" file entries
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Parse body — support both JSON and FormData (for attachments)
  let to: string[] = [];
  let cc: string[] | undefined;
  let bcc: string[] | undefined;
  let subject = "";
  let emailBody = "";
  let reply_to_id: string | undefined;
  let forward_id: string | undefined;
  const attachmentBuffers: Array<{ filename: string; content: Buffer; contentType: string }> = [];

  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    // FormData path (with potential attachments)
    const formData = await request.formData();

    const toRaw = formData.get("to") as string | null;
    to = toRaw ? JSON.parse(toRaw) : [];
    subject = (formData.get("subject") as string) || "";
    emailBody = (formData.get("body") as string) || "";

    const ccRaw = formData.get("cc") as string | null;
    if (ccRaw) cc = JSON.parse(ccRaw);
    const bccRaw = formData.get("bcc") as string | null;
    if (bccRaw) bcc = JSON.parse(bccRaw);

    reply_to_id = (formData.get("reply_to_id") as string) || undefined;
    forward_id = (formData.get("forward_id") as string) || undefined;

    // Extract file attachments
    const files = formData.getAll("attachments");
    for (const file of files) {
      if (file instanceof File && file.size > 0) {
        const arrayBuffer = await file.arrayBuffer();
        attachmentBuffers.push({
          filename: file.name,
          content: Buffer.from(arrayBuffer),
          contentType: file.type || "application/octet-stream",
        });
      }
    }
  } else {
    // JSON path (legacy, no attachments)
    try {
      const body = await request.json();
      to = body.to || [];
      cc = body.cc;
      bcc = body.bcc;
      subject = body.subject || "";
      emailBody = body.body || "";
      reply_to_id = body.reply_to_id;
      forward_id = body.forward_id;
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
  }

  // Validation
  if (!to.length) return NextResponse.json({ error: "Missing required field: to" }, { status: 400 });
  if (!subject.trim()) return NextResponse.json({ error: "Missing required field: subject" }, { status: 400 });
  if (!emailBody.trim()) return NextResponse.json({ error: "Missing required field: body" }, { status: 400 });

  // Check total attachment size (max 25 MB combined — Microsoft Graph limit)
  const totalSize = attachmentBuffers.reduce((sum, a) => sum + a.content.length, 0);
  if (totalSize > 25 * 1024 * 1024) {
    return NextResponse.json({ error: "La taille totale des pièces jointes dépasse 25 MB" }, { status: 400 });
  }

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
    const draft = {
      to,
      cc,
      bcc,
      subject,
      bodyHtml: emailBody,
      attachments: attachmentBuffers.length > 0 ? attachmentBuffers : undefined,
    };

    if (reply_to_id) {
      await provider.replyToEmail(connection as EmailConnectionConfig, reply_to_id, draft);
    } else if (forward_id) {
      await provider.sendEmail(connection as EmailConnectionConfig, draft);
    } else {
      await provider.sendEmail(connection as EmailConnectionConfig, draft);
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
