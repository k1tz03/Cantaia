import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/briefing/feedback
 * Store user rating for a daily briefing.
 * Body: { briefing_date: "YYYY-MM-DD", rating: 1-5, comment?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();

    const body = await request.json();
    const { briefing_date, rating, comment } = body;

    if (!briefing_date) {
      return NextResponse.json(
        { error: "briefing_date is required (YYYY-MM-DD)" },
        { status: 400 }
      );
    }

    if (!rating || typeof rating !== "number" || rating < 1 || rating > 5) {
      return NextResponse.json(
        { error: "rating must be a number between 1 and 5" },
        { status: 400 }
      );
    }

    // Find the briefing for this user and date
    const { data: briefing } = await (admin as any)
      .from("daily_briefings")
      .select("id, user_id")
      .eq("user_id", user.id)
      .eq("briefing_date", briefing_date)
      .maybeSingle();

    if (!briefing) {
      return NextResponse.json(
        { error: "Briefing not found for this date" },
        { status: 404 }
      );
    }

    // Update the briefing record with rating and comment
    const { error: updateError } = await (admin as any)
      .from("daily_briefings")
      .update({
        rating,
        rating_comment: comment?.substring(0, 500) || null,
        rated_at: new Date().toISOString(),
      })
      .eq("id", briefing.id);

    if (updateError) {
      console.error("[briefing/feedback] Update error:", updateError);

      // If the columns don't exist yet, try inserting into a separate feedback mechanism
      // via the content JSONB field as a fallback
      try {
        const { data: currentBriefing } = await (admin as any)
          .from("daily_briefings")
          .select("content")
          .eq("id", briefing.id)
          .maybeSingle();

        const existingContent = currentBriefing?.content || {};
        await (admin as any)
          .from("daily_briefings")
          .update({
            content: {
              ...existingContent,
              _feedback: {
                rating,
                comment: comment?.substring(0, 500) || null,
                rated_at: new Date().toISOString(),
              },
            },
          })
          .eq("id", briefing.id);

        return NextResponse.json({ success: true, rating, fallback: true });
      } catch (fallbackErr) {
        console.error("[briefing/feedback] Fallback update error:", fallbackErr);
        return NextResponse.json(
          { error: "Failed to save feedback" },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ success: true, rating });
  } catch (err: any) {
    console.error("[briefing/feedback] Error:", err?.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
