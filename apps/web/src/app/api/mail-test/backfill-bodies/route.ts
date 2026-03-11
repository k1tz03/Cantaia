import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getValidMicrosoftToken } from "@/lib/microsoft/tokens";

/**
 * POST /api/mail-test/backfill-bodies
 * Fetches full email bodies from Microsoft Graph for emails that only have body_preview.
 * Superadmin only. Processes up to 20 emails per call.
 */
export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();

    // Check superadmin
    const { data: profile } = await (admin as any)
      .from("users")
      .select("is_superadmin")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.is_superadmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get Microsoft token
    const tokenResult = await getValidMicrosoftToken(user.id);
    if ("error" in tokenResult) {
      return NextResponse.json({
        error: "Microsoft non connecté — reconnectez votre compte",
      }, { status: 400 });
    }
    const accessToken = tokenResult.accessToken;

    // Fetch emails with no body_html AND no body_text but with an outlook_message_id
    const { data: emails } = await (admin as any)
      .from("email_records")
      .select("id, outlook_message_id, subject")
      .eq("user_id", user.id)
      .not("outlook_message_id", "is", null)
      .is("body_html", null)
      .is("body_text", null)
      .order("received_at", { ascending: false })
      .limit(20);

    if (!emails || emails.length === 0) {
      console.log("[BACKFILL] No emails to backfill");
      return NextResponse.json({ success: true, updated: 0, total: 0 });
    }

    console.log(`[BACKFILL] Found ${emails.length} emails to backfill`);

    let updated = 0;
    let errors = 0;

    for (const email of emails) {
      try {
        const graphRes = await fetch(
          `https://graph.microsoft.com/v1.0/me/messages/${email.outlook_message_id}?$select=body`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );

        if (!graphRes.ok) {
          console.warn(`[BACKFILL] Graph error for ${email.id}: ${graphRes.status}`);
          errors++;
          continue;
        }

        const graphData = await graphRes.json();
        const body = graphData.body;

        if (!body?.content) {
          console.warn(`[BACKFILL] No body content for ${email.id}`);
          continue;
        }

        const updatePayload: Record<string, string> = {};

        if (body.contentType === "html" || body.contentType === "HTML") {
          updatePayload.body_html = body.content;
          // Also derive body_text from HTML
          const plainText = stripHtml(body.content);
          updatePayload.body_text = plainText;
        } else {
          updatePayload.body_text = body.content;
        }

        await (admin as any)
          .from("email_records")
          .update(updatePayload)
          .eq("id", email.id);

        updated++;
        console.log(`[BACKFILL] Updated ${email.id}: "${(email.subject || "").slice(0, 50)}"`);
      } catch (err: any) {
        console.error(`[BACKFILL] Error for ${email.id}:`, err?.message || err);
        errors++;
      }
    }

    console.log(`[BACKFILL] Done. Updated: ${updated}, Errors: ${errors}, Total: ${emails.length}`);
    return NextResponse.json({ success: true, updated, errors, total: emails.length });
  } catch (err: any) {
    console.error("[BACKFILL] Fatal error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
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
