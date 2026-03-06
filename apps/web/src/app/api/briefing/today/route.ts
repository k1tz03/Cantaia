import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const CACHE_DURATION_MS = 6 * 60 * 60 * 1000; // 6 hours

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Support date query param for history (default: today)
  const { searchParams } = new URL(request.url);
  const dateParam = searchParams.get("date");
  const today = new Date().toISOString().split("T")[0];
  const targetDate = dateParam || today;

  // Fetch briefing for the target date
  const { data: existing } = await (admin as any)
    .from("daily_briefings")
    .select("id, user_id, briefing_date, content, created_at")
    .eq("user_id", user.id)
    .eq("briefing_date", targetDate)
    .maybeSingle();

  if (existing) {
    // Check freshness only for today's briefing
    const createdAt = new Date(existing.created_at).getTime();
    const now = Date.now();
    const isFresh = targetDate !== today || now - createdAt < CACHE_DURATION_MS;

    return NextResponse.json({
      briefing: existing.content,
      briefing_id: existing.id,
      briefing_date: existing.briefing_date,
      created_at: existing.created_at,
      is_fresh: isFresh,
      needs_regeneration: !isFresh,
    });
  }

  // No briefing found
  return NextResponse.json(
    { error: "No briefing for this date", needs_generation: targetDate === today },
    { status: 404 }
  );
}
