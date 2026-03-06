import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getValidMicrosoftToken } from "@/lib/microsoft/tokens";

/**
 * GET /api/outlook/email-body?messageId={outlookMessageId}
 * Fetches the full email body (HTML or text) from Microsoft Graph.
 * Also fetches inline attachments and replaces CID references with base64 data URIs.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const messageId = request.nextUrl.searchParams.get("messageId");
  if (!messageId) {
    return NextResponse.json(
      { error: "messageId query parameter is required" },
      { status: 400 }
    );
  }

  const tokenResult = await getValidMicrosoftToken(user.id);
  if (!tokenResult.accessToken) {
    return NextResponse.json(
      { error: "Microsoft token not available" },
      { status: 401 }
    );
  }

  const accessToken = tokenResult.accessToken;

  try {
    // Fetch email body
    const graphRes = await fetch(
      `https://graph.microsoft.com/v1.0/me/messages/${messageId}?$select=body`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!graphRes.ok) {
      const errBody = await graphRes.json().catch(() => ({}));
      return NextResponse.json(
        { error: errBody?.error?.message || `Graph API ${graphRes.status}` },
        { status: graphRes.status }
      );
    }

    const data = await graphRes.json();
    let content = data.body?.content || "";
    const contentType = data.body?.contentType || "text";

    // If HTML content, fetch inline attachments and replace CID references
    if (contentType === "html" && content.includes("cid:")) {
      try {
        const attRes = await fetch(
          `https://graph.microsoft.com/v1.0/me/messages/${messageId}/attachments`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
          }
        );

        if (attRes.ok) {
          const attData = await attRes.json();
          const inlineAtts = (attData.value || []).filter(
            (a: { isInline: boolean; contentBytes?: string; contentId?: string }) =>
              a.isInline && a.contentBytes
          );

          if (process.env.NODE_ENV === "development") console.log(`[email-body] Found ${inlineAtts.length} inline attachments for ${messageId}`);

          for (const att of inlineAtts) {
            const cid = att.contentId || att.name;
            if (cid && att.contentBytes) {
              const dataUri = `data:${att.contentType};base64,${att.contentBytes}`;
              // Replace cid:contentId references in HTML
              content = content.replace(
                new RegExp(`cid:${cid.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "gi"),
                dataUri
              );
              // Also try without angle brackets (some emails use different formats)
              content = content.replace(
                new RegExp(`cid:${cid.replace(/^<|>$/g, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "gi"),
                dataUri
              );
            }
          }
        }
      } catch (attErr) {
        console.warn("[email-body] Failed to fetch inline attachments:", attErr);
        // Continue without inline images — body still works
      }
    }

    return NextResponse.json({
      success: true,
      contentType,
      content,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
