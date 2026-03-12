import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/mail/generate-summaries
 * Generates AI summaries for emails that don't have one yet.
 * Processes up to 10 emails per call.
 */
export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();

    // Fetch emails without ai_summary — use body_text OR body_preview from DB only (no Graph)
    const { data: emails } = await (admin as any)
      .from("email_records")
      .select("id, subject, sender_name, sender_email, body_preview, body_text")
      .eq("user_id", user.id)
      .is("ai_summary", null)
      .order("received_at", { ascending: false })
      .limit(10);

    // Filter out emails with no usable body content
    const emailsWithBody = (emails || []).filter(
      (e: any) => (e.body_text && e.body_text.trim()) || (e.body_preview && e.body_preview.trim())
    );

    console.log(`[SUMMARY] Found ${emails?.length || 0} emails without summary, ${emailsWithBody.length} with body content`);

    if (emailsWithBody.length === 0) {
      return NextResponse.json({ success: true, updated: 0 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
    }

    // Import Anthropic dynamically to avoid client bundling
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey });

    let updated = 0;

    for (const email of emailsWithBody) {
      try {
        const bodyText = email.body_text || email.body_preview || "";

        // Truncate to avoid token overuse
        const truncated = bodyText.length > 2000 ? bodyText.slice(0, 2000) + "..." : bodyText;

        console.log(`[SUMMARY] Processing email ${email.id}: "${email.subject}" (${truncated.length} chars)`);

        const response = await client.messages.create({
          model: "claude-sonnet-4-5-20250929",
          max_tokens: 150,
          system: "Résume cet email en 1-2 phrases maximum, en français, de façon neutre et factuelle. Ne commence pas par 'Cet email' ou 'L'email'.",
          messages: [
            {
              role: "user",
              content: `Sujet : ${email.subject}\nCorps : ${truncated}`,
            },
          ],
        });

        const summary = (response.content[0] as any)?.text?.trim();
        if (summary) {
          await (admin as any)
            .from("email_records")
            .update({ ai_summary: summary })
            .eq("id", email.id);
          updated++;
          console.log(`[SUMMARY] Généré pour: ${email.id} → "${summary.slice(0, 80)}..."`);
        }
      } catch (err: any) {
        console.error(`[SUMMARY] Error for email ${email.id}:`, err?.message || err);
      }
    }

    console.log(`[SUMMARY] Done. Updated ${updated}/${emailsWithBody.length}`);
    return NextResponse.json({ success: true, updated });
  } catch (err: any) {
    console.error("[generate-summaries] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
