import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getValidMicrosoftToken } from "@/lib/microsoft/tokens";

/**
 * GET /api/debug/email-images?id=EMAIL_ID
 *
 * Diagnostic endpoint: shows what image references exist in an email's body_html
 * AND tests the full Graph API attachment chain to debug CID image resolution.
 *
 * Returns:
 * - HTML analysis (img tags, cid refs, src values)
 * - Graph attachments metadata (contentId, name, isInline, contentType, size)
 * - CID matching test (which CIDs match which attachments)
 */
export async function GET(request: NextRequest) {
  const emailId = request.nextUrl.searchParams.get("id");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  // If no ID, get the latest email for this user
  let query = (admin as any).from("email_records")
    .select("id, subject, outlook_message_id, body_html, body_text, body_preview, sender_email, classification")
    .eq("user_id", user.id);

  if (emailId) {
    query = query.eq("id", emailId);
  } else {
    query = query.order("received_at", { ascending: false }).limit(1);
  }

  const { data: emails, error } = await query;
  if (error || !emails?.length) {
    return NextResponse.json({ error: "Email not found", detail: error?.message });
  }

  const email = emails[0];
  const bodyHtml = email.body_html || "";

  // ── 1. Analyze image patterns in the HTML ──
  const imgTagRegex = /<img\s[^>]*>/gi;
  const imgTags = bodyHtml.match(imgTagRegex) || [];

  const cidRefs = bodyHtml.match(/cid:[^"'\s]*/gi) || [];
  const cidValues = cidRefs.map((r: string) => r.replace(/^cid:/i, ""));

  const srcAttrs = imgTags.map((tag: string) => {
    const srcMatch = tag.match(/src\s*=\s*["']([^"']*?)["']/i);
    return srcMatch ? srcMatch[1] : "(no src)";
  });

  const msUrls = srcAttrs.filter((s: string) =>
    s.includes("outlook.office365.com") || s.includes("attachments.office.net") ||
    s.includes("graph.microsoft.com") || s.includes("outlook.office.com")
  );

  const dataUris = srcAttrs.filter((s: string) => s.startsWith("data:"));

  // ── 2. Fetch Graph attachments if we have an outlook_message_id ──
  let graphAttachments: any[] = [];
  let graphError: string | null = null;
  let cidMatchResults: any[] = [];

  if (email.outlook_message_id) {
    const tokenResult = await getValidMicrosoftToken(user.id);
    if ("error" in tokenResult) {
      graphError = `Token error: ${tokenResult.error}`;
    } else {
      try {
        // Fetch attachments — include contentBytes to test the full chain
        const attRes = await fetch(
          `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(email.outlook_message_id)}/attachments`,
          { headers: { Authorization: `Bearer ${tokenResult.accessToken}` } }
        );

        if (!attRes.ok) {
          graphError = `Graph API returned ${attRes.status}: ${await attRes.text().catch(() => "")}`;
        } else {
          const attData = await attRes.json();
          const rawAttachments = attData.value || [];

          // Summarize attachments (don't include contentBytes in response — too large)
          graphAttachments = rawAttachments.map((att: any) => ({
            id: att.id,
            contentId: att.contentId || null,
            contentId_cleaned: att.contentId?.replace(/^<|>$/g, "") || null,
            name: att.name || null,
            name_base: att.name?.replace(/\.[^.]+$/, "") || null,
            contentType: att.contentType || null,
            isInline: att.isInline || false,
            size: att.size || null,
            hasContentBytes: !!att.contentBytes,
            contentBytesLength: att.contentBytes?.length || 0,
          }));

          // ── 3. Test CID matching logic (same as cid-image proxy route) ──
          for (const cidVal of cidValues) {
            const cidClean = cidVal.replace(/^<|>$/g, "");
            const cidBase = cidClean.split("@")[0]?.replace(/\.[^.]+$/, "");

            let matchType = "NO_MATCH";
            let matchedAttachment: any = null;

            // Try exact contentId match
            for (const att of rawAttachments) {
              if (!att.contentBytes) continue;
              const attCid = att.contentId?.replace(/^<|>$/g, "") || "";

              if (attCid === cidClean || attCid === cidVal) {
                matchType = "EXACT_CONTENT_ID";
                matchedAttachment = { contentId: att.contentId, name: att.name };
                break;
              }
              if (att.name === cidClean || att.name === cidVal) {
                matchType = "EXACT_NAME";
                matchedAttachment = { contentId: att.contentId, name: att.name };
                break;
              }
            }

            // Try loose match (filename base)
            if (matchType === "NO_MATCH") {
              for (const att of rawAttachments) {
                if (!att.contentBytes) continue;
                const attName = att.name?.replace(/\.[^.]+$/, "") || "";
                if (attName === cidBase) {
                  matchType = "LOOSE_NAME_BASE";
                  matchedAttachment = { contentId: att.contentId, name: att.name };
                  break;
                }
              }
            }

            // Try partial match — check if CID contains attachment name or vice versa
            if (matchType === "NO_MATCH") {
              for (const att of rawAttachments) {
                if (!att.contentBytes) continue;
                const attCid = att.contentId?.replace(/^<|>$/g, "") || "";
                const attName = att.name || "";
                if (attCid && cidClean.includes(attCid)) {
                  matchType = "PARTIAL_CID_CONTAINS_ATT";
                  matchedAttachment = { contentId: att.contentId, name: att.name };
                  break;
                }
                if (attCid && attCid.includes(cidClean)) {
                  matchType = "PARTIAL_ATT_CONTAINS_CID";
                  matchedAttachment = { contentId: att.contentId, name: att.name };
                  break;
                }
                if (attName && cidClean.includes(attName.replace(/\.[^.]+$/, ""))) {
                  matchType = "PARTIAL_CID_CONTAINS_NAME";
                  matchedAttachment = { contentId: att.contentId, name: att.name };
                  break;
                }
              }
            }

            cidMatchResults.push({
              cid_in_html: `cid:${cidVal}`,
              cid_cleaned: cidClean,
              cid_base: cidBase,
              match_type: matchType,
              matched_attachment: matchedAttachment,
            });
          }
        }
      } catch (err: any) {
        graphError = `Exception: ${err?.message}`;
      }
    }
  }

  // ── 4. Summary verdict ──
  const totalCids = cidValues.length;
  const matchedCids = cidMatchResults.filter(r => r.match_type !== "NO_MATCH").length;
  const inlineAttachments = graphAttachments.filter(a => a.isInline || a.contentId);

  return NextResponse.json({
    email_id: email.id,
    subject: email.subject,
    sender: email.sender_email,
    classification: email.classification,
    outlook_message_id: email.outlook_message_id || "(NULL — THIS IS THE PROBLEM)",

    // Verdict
    verdict: {
      cids_in_html: totalCids,
      graph_inline_attachments: inlineAttachments.length,
      cids_matched: matchedCids,
      cids_unmatched: totalCids - matchedCids,
      will_images_display: matchedCids === totalCids && totalCids > 0
        ? "YES — all CIDs match Graph attachments"
        : matchedCids > 0
          ? `PARTIAL — ${matchedCids}/${totalCids} CIDs match`
          : totalCids > 0
            ? "NO — CID format mismatch between HTML and Graph attachments"
            : "N/A — no CID references in HTML",
    },

    // HTML analysis
    html_analysis: {
      body_html_length: bodyHtml.length,
      total_img_tags: imgTags.length,
      cid_references: cidRefs,
      img_src_values: srcAttrs,
      microsoft_urls: msUrls,
      data_uris_count: dataUris.length,
    },

    // Graph API results
    graph_api: {
      error: graphError,
      total_attachments: graphAttachments.length,
      attachments: graphAttachments,
    },

    // CID matching test results
    cid_matching: cidMatchResults,

    body_html_first_3000: bodyHtml.substring(0, 3000),
  });
}
