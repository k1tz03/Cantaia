import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/mail-test/generate-summaries
 * Generates AI summaries for emails that don't have one yet.
 * Processes up to 10 emails per call.
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

    // Fetch emails without ai_summary
    const { data: emails } = await (admin as any)
      .from("email_records")
      .select("id, subject, sender_name, sender_email, body_preview, body_text")
      .eq("user_id", user.id)
      .is("ai_summary", null)
      .not("body_preview", "is", null)
      .order("received_at", { ascending: false })
      .limit(10);

    if (!emails || emails.length === 0) {
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

    for (const email of emails) {
      try {
        const bodyText = email.body_text || email.body_preview || "";
        if (!bodyText.trim()) continue;

        // Truncate to avoid token overuse
        const truncated = bodyText.length > 2000 ? bodyText.slice(0, 2000) + "..." : bodyText;

        const response = await client.messages.create({
          model: "claude-sonnet-4-5-20250929",
          max_tokens: 150,
          system: "Tu es un assistant de gestion de chantier. Résume cet email en 1-2 phrases maximum, en français. Sois factuel et concis. Ne commence pas par 'Cet email' ou 'L'email'.",
          messages: [
            {
              role: "user",
              content: `Objet: ${email.subject}\nDe: ${email.sender_name || email.sender_email}\n\n${truncated}`,
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
        }
      } catch (err) {
        console.error(`[generate-summaries] Error for email ${email.id}:`, err);
        // Continue with next email
      }
    }

    return NextResponse.json({ success: true, updated });
  } catch (err: any) {
    console.error("[generate-summaries] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
