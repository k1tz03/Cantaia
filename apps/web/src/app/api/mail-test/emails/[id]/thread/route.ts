import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getValidMicrosoftToken } from "@/lib/microsoft/tokens";

interface ThreadMessage {
  id: string;
  subject: string;
  from: { name: string; email: string };
  to: { name: string; email: string }[];
  cc: { name: string; email: string }[];
  receivedDateTime: string;
  body: { content: string; contentType: string };
  bodyPreview: string;
  isCurrentMessage: boolean;
}

/**
 * GET /api/mail-test/emails/[id]/thread
 * Fetches the full conversation thread from Microsoft Graph.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: emailId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();

    // Get the email record
    const { data: emailRecord } = await (admin as any)
      .from("email_records")
      .select("id, outlook_message_id, subject, sender_email, sender_name, body_preview, body_text, body_html, received_at, ai_summary")
      .eq("id", emailId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!emailRecord) {
      return NextResponse.json({ error: "Email not found" }, { status: 404 });
    }

    if (!emailRecord.outlook_message_id) {
      // No Outlook ID — can't fetch thread, return fallback
      return NextResponse.json({
        thread: null,
        error: "Pas d'identifiant Outlook — conversation indisponible",
        fallback: {
          subject: emailRecord.subject,
          from: { name: emailRecord.sender_name || "", email: emailRecord.sender_email },
          body: emailRecord.body_html || emailRecord.body_text || emailRecord.body_preview || "",
          bodyPreview: emailRecord.body_preview || "",
          receivedDateTime: emailRecord.received_at,
          ai_summary: emailRecord.ai_summary || null,
        },
      });
    }

    // Get Microsoft token
    const tokenResult = await getValidMicrosoftToken(user.id);
    if ("error" in tokenResult) {
      return NextResponse.json({
        thread: null,
        error: "Impossible de charger la conversation — reconnectez Microsoft",
        fallback: {
          subject: emailRecord.subject,
          from: { name: emailRecord.sender_name || "", email: emailRecord.sender_email },
          body: emailRecord.body_html || emailRecord.body_text || emailRecord.body_preview || "",
          bodyPreview: emailRecord.body_preview || "",
          receivedDateTime: emailRecord.received_at,
          ai_summary: emailRecord.ai_summary || null,
        },
      });
    }

    const accessToken = tokenResult.accessToken;

    // Step 1: Get conversationId from the message
    const msgRes = await fetch(
      `https://graph.microsoft.com/v1.0/me/messages/${emailRecord.outlook_message_id}?$select=conversationId,subject`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!msgRes.ok) {
      console.error("[thread] Failed to fetch message:", msgRes.status, await msgRes.text());
      return NextResponse.json({
        thread: null,
        error: "Impossible de charger la conversation",
        fallback: {
          subject: emailRecord.subject,
          from: { name: emailRecord.sender_name || "", email: emailRecord.sender_email },
          body: emailRecord.body_html || emailRecord.body_text || emailRecord.body_preview || "",
          bodyPreview: emailRecord.body_preview || "",
          receivedDateTime: emailRecord.received_at,
          ai_summary: emailRecord.ai_summary || null,
        },
      });
    }

    const msgData = await msgRes.json();
    const conversationId = msgData.conversationId;

    if (!conversationId) {
      return NextResponse.json({
        thread: null,
        error: "Pas de conversationId trouvé",
        fallback: {
          subject: emailRecord.subject,
          from: { name: emailRecord.sender_name || "", email: emailRecord.sender_email },
          body: emailRecord.body_html || emailRecord.body_text || emailRecord.body_preview || "",
          bodyPreview: emailRecord.body_preview || "",
          receivedDateTime: emailRecord.received_at,
          ai_summary: emailRecord.ai_summary || null,
        },
      });
    }

    // Step 2: Fetch all messages in this conversation
    const threadRes = await fetch(
      `https://graph.microsoft.com/v1.0/me/messages?$filter=conversationId eq '${conversationId}'&$select=id,subject,from,toRecipients,ccRecipients,receivedDateTime,body,bodyPreview&$orderby=receivedDateTime asc&$top=50`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!threadRes.ok) {
      console.error("[thread] Failed to fetch thread:", threadRes.status, await threadRes.text());
      return NextResponse.json({
        thread: null,
        error: "Impossible de charger la conversation",
        fallback: {
          subject: emailRecord.subject,
          from: { name: emailRecord.sender_name || "", email: emailRecord.sender_email },
          body: emailRecord.body_html || emailRecord.body_text || emailRecord.body_preview || "",
          bodyPreview: emailRecord.body_preview || "",
          receivedDateTime: emailRecord.received_at,
          ai_summary: emailRecord.ai_summary || null,
        },
      });
    }

    const threadData = await threadRes.json();
    const messages = threadData.value || [];

    const thread: ThreadMessage[] = messages.map((msg: any) => ({
      id: msg.id,
      subject: msg.subject || "",
      from: {
        name: msg.from?.emailAddress?.name || "",
        email: msg.from?.emailAddress?.address || "",
      },
      to: (msg.toRecipients || []).map((r: any) => ({
        name: r.emailAddress?.name || "",
        email: r.emailAddress?.address || "",
      })),
      cc: (msg.ccRecipients || []).map((r: any) => ({
        name: r.emailAddress?.name || "",
        email: r.emailAddress?.address || "",
      })),
      receivedDateTime: msg.receivedDateTime || "",
      body: {
        content: msg.body?.content || "",
        contentType: msg.body?.contentType || "text",
      },
      bodyPreview: msg.bodyPreview || "",
      isCurrentMessage: msg.id === emailRecord.outlook_message_id,
    }));

    return NextResponse.json({
      thread,
      totalMessages: thread.length,
    });
  } catch (err: any) {
    console.error("[mail-test/thread] Error:", err);
    return NextResponse.json({ thread: null, error: err.message }, { status: 500 });
  }
}
