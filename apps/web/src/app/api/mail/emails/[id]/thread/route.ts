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
 * GET /api/mail/emails/[id]/thread
 * Fetches the full conversation thread from Microsoft Graph.
 * On-demand backfill: if body_html/body_text are missing, fetches and saves them.
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

    // Helper: build fallback from current emailRecord state
    // Optionally resolves cid: inline images if token available
    async function buildFallback(record: typeof emailRecord, token?: string | null) {
      let body = record.body_html || record.body_text || record.body_preview || "";

      // Resolve cid: references in fallback HTML body
      if (token && record.outlook_message_id && body.includes("cid:")) {
        try {
          const attRes = await fetch(
            `https://graph.microsoft.com/v1.0/me/messages/${record.outlook_message_id}/attachments?$select=id,contentId,contentType,contentBytes,isInline,name`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          if (attRes.ok) {
            const attData = await attRes.json();
            const inlineAtts = (attData.value || []).filter(
              (a: any) => a.isInline && a.contentBytes
            );
            for (const att of inlineAtts) {
              const cid = att.contentId || att.name;
              if (cid && att.contentBytes) {
                const dataUri = `data:${att.contentType};base64,${att.contentBytes}`;
                body = body
                  .replace(new RegExp(`cid:${cid.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "gi"), dataUri)
                  .replace(new RegExp(`cid:${cid.replace(/^<|>$/g, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "gi"), dataUri);
              }
            }
          }
        } catch (err: any) {
          console.warn(`[thread] Fallback CID resolve failed:`, err?.message);
        }
      }

      return {
        subject: record.subject,
        from: { name: record.sender_name || "", email: record.sender_email },
        body,
        bodyPreview: record.body_preview || "",
        receivedDateTime: record.received_at,
        ai_summary: record.ai_summary || null,
      };
    }

    // On-demand backfill: if we have an outlook_message_id but no full body,
    // try to fetch it from Graph and save it to DB
    const needsBodyBackfill = emailRecord.outlook_message_id && !emailRecord.body_html && !emailRecord.body_text;

    // Get Microsoft token (needed for both thread and backfill)
    let accessToken: string | null = null;
    if (emailRecord.outlook_message_id) {
      const tokenResult = await getValidMicrosoftToken(user.id);
      if (!("error" in tokenResult)) {
        accessToken = tokenResult.accessToken;
      }
    }

    // Backfill body if needed and we have a token
    if (needsBodyBackfill && accessToken) {
      try {
        const bodyRes = await fetch(
          `https://graph.microsoft.com/v1.0/me/messages/${emailRecord.outlook_message_id}?$select=body`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (bodyRes.ok) {
          const bodyData = await bodyRes.json();
          const body = bodyData.body;
          if (body?.content) {
            const updatePayload: Record<string, string> = {};
            if (body.contentType === "html" || body.contentType === "HTML") {
              updatePayload.body_html = body.content;
              updatePayload.body_text = stripHtml(body.content);
            } else {
              updatePayload.body_text = body.content;
            }
            await (admin as any)
              .from("email_records")
              .update(updatePayload)
              .eq("id", emailRecord.id);

            // Update local record for the response
            emailRecord.body_html = updatePayload.body_html || null;
            emailRecord.body_text = updatePayload.body_text || null;
            console.log(`[thread] Backfilled body for ${emailRecord.id}: ${Object.keys(updatePayload).join(", ")}`);
          }
        } else {
          console.warn(`[thread] Body backfill failed for ${emailRecord.id}: ${bodyRes.status}`);
        }
      } catch (err: any) {
        console.warn(`[thread] Body backfill error for ${emailRecord.id}:`, err?.message);
      }
    }

    if (!emailRecord.outlook_message_id || !accessToken) {
      return NextResponse.json({
        thread: null,
        error: !emailRecord.outlook_message_id
          ? "Pas d'identifiant Outlook — conversation indisponible"
          : "Connexion Microsoft requise",
        fallback: await buildFallback(emailRecord, accessToken),
      });
    }

    // Step 1: Get conversationId from the message
    const msgRes = await fetch(
      `https://graph.microsoft.com/v1.0/me/messages/${emailRecord.outlook_message_id}?$select=conversationId,subject`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!msgRes.ok) {
      console.warn("[thread] Graph message fetch failed:", msgRes.status);
      return NextResponse.json({
        thread: null,
        error: "Conversation complète indisponible",
        fallback: await buildFallback(emailRecord, accessToken),
      });
    }

    const msgData = await msgRes.json();
    const conversationId = msgData.conversationId;

    if (!conversationId) {
      return NextResponse.json({
        thread: null,
        error: "Pas de conversationId trouvé",
        fallback: await buildFallback(emailRecord, accessToken),
      });
    }

    // Step 2: Fetch all messages in this conversation
    const threadRes = await fetch(
      `https://graph.microsoft.com/v1.0/me/messages?$filter=conversationId eq '${conversationId}'&$select=id,subject,from,toRecipients,ccRecipients,receivedDateTime,body,bodyPreview&$orderby=receivedDateTime asc&$top=50`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!threadRes.ok) {
      console.warn("[thread] Graph thread fetch failed:", threadRes.status);
      return NextResponse.json({
        thread: null,
        error: "Conversation complète indisponible",
        fallback: await buildFallback(emailRecord, accessToken),
      });
    }

    const threadData = await threadRes.json();
    const messages = threadData.value || [];

    // Resolve cid: inline images for each message that has them
    const thread: ThreadMessage[] = await Promise.all(
      messages.map(async (msg: any) => {
        let bodyContent = msg.body?.content || "";
        const contentType = msg.body?.contentType || "text";

        // Resolve cid: references to base64 data URIs
        if (contentType === "html" && bodyContent.includes("cid:")) {
          try {
            const attRes = await fetch(
              `https://graph.microsoft.com/v1.0/me/messages/${msg.id}/attachments?$select=id,contentId,contentType,contentBytes,isInline,name`,
              { headers: { Authorization: `Bearer ${accessToken}` } }
            );
            if (attRes.ok) {
              const attData = await attRes.json();
              const inlineAtts = (attData.value || []).filter(
                (a: any) => a.isInline && a.contentBytes
              );
              for (const att of inlineAtts) {
                const cid = att.contentId || att.name;
                if (cid && att.contentBytes) {
                  const dataUri = `data:${att.contentType};base64,${att.contentBytes}`;
                  bodyContent = bodyContent
                    .replace(new RegExp(`cid:${cid.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "gi"), dataUri)
                    .replace(new RegExp(`cid:${cid.replace(/^<|>$/g, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "gi"), dataUri);
                }
              }
            }
          } catch (err: any) {
            console.warn(`[thread] CID resolve failed for ${msg.id}:`, err?.message);
          }
        }

        return {
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
            content: bodyContent,
            contentType,
          },
          bodyPreview: msg.bodyPreview || "",
          isCurrentMessage: msg.id === emailRecord.outlook_message_id,
        };
      })
    );

    return NextResponse.json({
      thread,
      totalMessages: thread.length,
    });
  } catch (err: any) {
    console.error("[mail/thread] Error:", err);
    return NextResponse.json({ thread: null, error: err.message }, { status: 500 });
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
