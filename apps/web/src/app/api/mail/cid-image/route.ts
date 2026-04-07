import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getValidMicrosoftToken } from "@/lib/microsoft/tokens";

/**
 * GET /api/mail/cid-image?msgId=OUTLOOK_MSG_ID&cid=image001.png@01D...&idx=0
 *
 * Proxies CID (Content-ID) inline images from Microsoft Graph.
 * Outlook embeds signature images as cid: references — the browser can't resolve
 * these directly, so this route fetches the attachment from Graph and serves it.
 *
 * Matching strategy (in order):
 *  1. Exact contentId match (with/without angle brackets)
 *  2. Exact name match
 *  3. Loose name-base match (filename without extension)
 *  4. Positional fallback: idx parameter = Nth inline image attachment
 *     This handles the common case where Outlook/Graph uses different CID formats
 *     in body_html vs. attachment contentId (e.g., UUID in HTML but
 *     "image001.png@01DB..." in contentId).
 *
 * Caches for 7 days (signature images never change).
 */
export async function GET(request: NextRequest) {
  const msgId = request.nextUrl.searchParams.get("msgId");
  const cid = request.nextUrl.searchParams.get("cid");
  const idx = parseInt(request.nextUrl.searchParams.get("idx") || "-1", 10);

  if (!msgId || !cid) {
    return new NextResponse("Missing msgId or cid parameter", { status: 400 });
  }

  // Auth check
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  // Get Microsoft token
  const tokenResult = await getValidMicrosoftToken(user.id);
  if ("error" in tokenResult) {
    return new NextResponse("Microsoft token unavailable", { status: 502 });
  }

  try {
    // Fetch all inline attachments for this message
    const attRes = await fetch(
      `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(msgId)}/attachments?$select=id,contentId,contentType,contentBytes,isInline,name`,
      { headers: { Authorization: `Bearer ${tokenResult.accessToken}` } }
    );

    if (!attRes.ok) {
      console.warn(`[cid-image] Attachment fetch failed: ${attRes.status}`);
      return new NextResponse("Attachment fetch failed", { status: attRes.status });
    }

    const attData = await attRes.json();
    const attachments = attData.value || [];

    // Find the matching attachment by contentId or name
    const cidClean = cid.replace(/^<|>$/g, "");
    const match = attachments.find((att: any) => {
      if (!att.contentBytes) return false;
      const attCid = att.contentId?.replace(/^<|>$/g, "") || "";
      return (
        attCid === cidClean ||
        attCid === cid ||
        att.name === cidClean ||
        att.name === cid
      );
    });

    if (!match) {
      // Try a looser match — match by filename without extension
      const cidBase = cidClean.split("@")[0]?.replace(/\.[^.]+$/, "");
      const looseMatch = attachments.find((att: any) => {
        if (!att.contentBytes) return false;
        const attName = att.name?.replace(/\.[^.]+$/, "") || "";
        return attName === cidBase;
      });

      if (looseMatch) {
        // Use loose match
        const body = Buffer.from(looseMatch.contentBytes, "base64");
        return new NextResponse(body, {
          status: 200,
          headers: {
            "Content-Type": looseMatch.contentType || "image/png",
            "Cache-Control": "private, max-age=604800",
            "X-Content-Type-Options": "nosniff",
          },
        });
      }

      // Positional fallback: when CID format doesn't match (common with Outlook
      // where body has UUID-style CIDs but attachments use image001.png@... format),
      // use the idx parameter to return the Nth inline image attachment.
      if (idx >= 0) {
        const inlineImages = attachments.filter((att: any) =>
          att.contentBytes &&
          att.contentType?.startsWith("image/") &&
          (att.isInline || att.contentId)
        );

        if (idx < inlineImages.length) {
          console.log(`[cid-image] Positional match: cid=${cid} → attachment[${idx}] name=${inlineImages[idx].name}`);
          const body = Buffer.from(inlineImages[idx].contentBytes, "base64");
          return new NextResponse(body, {
            status: 200,
            headers: {
              "Content-Type": inlineImages[idx].contentType || "image/png",
              "Cache-Control": "private, max-age=604800",
              "X-Content-Type-Options": "nosniff",
            },
          });
        }
      }

      console.warn(`[cid-image] No matching attachment for cid=${cid} idx=${idx}, available:`,
        attachments.map((a: any) => ({ contentId: a.contentId, name: a.name, isInline: a.isInline }))
      );
      // Return transparent pixel instead of 404 (prevents broken image icon)
      const transparentGif = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
      return new NextResponse(transparentGif, {
        status: 200,
        headers: {
          "Content-Type": "image/gif",
          "Cache-Control": "private, max-age=86400",
        },
      });
    }

    // Return the image
    const body = Buffer.from(match.contentBytes, "base64");
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": match.contentType || "image/png",
        "Cache-Control": "private, max-age=604800", // 7 days
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err: any) {
    console.error("[cid-image] Error:", err?.message);
    return new NextResponse("Failed to fetch CID image", { status: 502 });
  }
}
