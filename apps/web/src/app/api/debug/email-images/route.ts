import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/debug/email-images?id=EMAIL_ID
 *
 * Diagnostic endpoint: shows what image references exist in an email's body_html.
 * Helps debug why inline images (signatures) don't display.
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

  // Analyze image patterns in the HTML
  const imgTagRegex = /<img\s[^>]*>/gi;
  const imgTags = bodyHtml.match(imgTagRegex) || [];

  const cidRefs = bodyHtml.match(/cid:[^"'\s]*/gi) || [];
  const srcAttrs = imgTags.map((tag: string) => {
    const srcMatch = tag.match(/src\s*=\s*["']([^"']*?)["']/i);
    return srcMatch ? srcMatch[1] : "(no src)";
  });

  const msUrls = srcAttrs.filter((s: string) =>
    s.includes("outlook.office365.com") || s.includes("attachments.office.net") ||
    s.includes("graph.microsoft.com") || s.includes("outlook.office.com")
  );

  const dataUris = srcAttrs.filter((s: string) => s.startsWith("data:"));

  return NextResponse.json({
    email_id: email.id,
    subject: email.subject,
    sender: email.sender_email,
    classification: email.classification,
    outlook_message_id: email.outlook_message_id || "(NULL — THIS IS THE PROBLEM)",
    body_html_length: bodyHtml.length,
    body_text_length: (email.body_text || "").length,
    body_preview_length: (email.body_preview || "").length,
    analysis: {
      total_img_tags: imgTags.length,
      cid_references: cidRefs,
      img_src_values: srcAttrs,
      microsoft_urls: msUrls,
      data_uris_count: dataUris.length,
    },
    body_html_first_3000: bodyHtml.substring(0, 3000),
  });
}
