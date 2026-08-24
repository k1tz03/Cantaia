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
 * Microsoft / Outlook image domains that require authentication.
 * These can't be loaded directly in <img> tags — we proxy them.
 */
const MS_IMAGE_DOMAINS = [
  "outlook.office365.com",
  "outlook.office.com",
  "attachments.office.net",
  "graph.microsoft.com",
  "outlook.live.com",
  "content.one.outlook.com",
];

/** Replace authenticated Microsoft image URLs with our proxy route */
function proxyMicrosoftImages(html: string): string {
  // Match img src attributes pointing to Microsoft domains
  return html.replace(
    /(<img\s[^>]*?\bsrc\s*=\s*["'])(https?:\/\/[^"']+)(["'])/gi,
    (_match, before, url, after) => {
      try {
        const parsed = new URL(url);
        const needsProxy = MS_IMAGE_DOMAINS.some(
          (d) => parsed.hostname === d || parsed.hostname.endsWith(`.${d}`)
        );
        if (needsProxy) {
          return `${before}/api/mail/image-proxy?url=${encodeURIComponent(url)}${after}`;
        }
      } catch { /* invalid URL, leave as-is */ }
      return `${before}${url}${after}`;
    }
  );
}

/**
 * B15: rewrite `cid:` inline-image references to our authenticated proxy route
 * instead of inlining the attachment bytes as base64 data URIs.
 *
 * The old approach fetched /attachments for every message in the thread (up to
 * 50 unbounded parallel Graph calls) and embedded each image as base64 — which
 * inflated a single thread response to several MB and blocked the whole request
 * on the slowest attachment fetch. /api/mail/cid-image already resolves a CID
 * (exact contentId, name, loose name, then positional `idx` fallback) and serves
 * the bytes with a 7-day private cache, so the browser can fetch them lazily.
 */
function rewriteCidImages(html: string, msgId: string | null | undefined): string {
  if (!html || !html.includes("cid:")) return html;

  const TRANSPARENT_PIXEL = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
  if (!msgId) {
    return html.replace(/(\bsrc\s*=\s*["'])cid:[^"']*?(["'])/gi, `$1${TRANSPARENT_PIXEL}$2`);
  }

  let cidIndex = 0;
  return html.replace(
    /(\bsrc\s*=\s*["'])cid:([^"']*?)(["'])/gi,
    (_m, before, cidRef, after) =>
      `${before}/api/mail/cid-image?msgId=${encodeURIComponent(msgId)}&cid=${encodeURIComponent(cidRef)}&idx=${cidIndex++}${after}`
  );
}

/**
 * Run an async mapper over items with a bounded number of in-flight tasks (B15).
 * A thread can hold up to 50 messages — never fan out unbounded.
 */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index], index);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
  await Promise.all(workers);
  return results;
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
    // cid: references are rewritten to the authenticated image proxy (B15)
    function buildFallback(record: typeof emailRecord) {
      let body = record.body_html || record.body_text || record.body_preview || "";

      body = rewriteCidImages(body, record.outlook_message_id);

      // Proxy authenticated Microsoft image URLs
      body = proxyMicrosoftImages(body);

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
        fallback: buildFallback(emailRecord),
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
        fallback: buildFallback(emailRecord),
      });
    }

    const msgData = await msgRes.json();
    const conversationId = msgData.conversationId;

    if (!conversationId) {
      return NextResponse.json({
        thread: null,
        error: "Pas de conversationId trouvé",
        fallback: buildFallback(emailRecord),
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
        fallback: buildFallback(emailRecord),
      });
    }

    const threadData = await threadRes.json();
    const messages = threadData.value || [];

    // Rewrite inline images (cid: → proxy route), bounded concurrency (B15)
    const thread: ThreadMessage[] = await mapWithConcurrency(
      messages,
      5,
      async (msg: any) => {
        let bodyContent = msg.body?.content || "";
        const contentType = msg.body?.contentType || "text";

        // Point cid: references at /api/mail/cid-image instead of inlining
        // multi-MB base64 payloads into this JSON response.
        if (contentType === "html" || contentType === "HTML") {
          bodyContent = rewriteCidImages(bodyContent, msg.id);
        }

        // Proxy authenticated Microsoft image URLs
        bodyContent = proxyMicrosoftImages(bodyContent);

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
      }
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
