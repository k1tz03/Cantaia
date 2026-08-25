import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/chat/feedback
 * Store user feedback (thumbs up/down) on a chat AI message.
 * Body: { conversation_id, message_index: number, rating: 'up' | 'down', comment?: string }
 *
 * NOTE: the `chat_feedback` table (migration 029) keys feedback by
 * `message_index` (position in the conversation) and attributes it via
 * `created_by` — it has no `message_id` / `user_id` column. Writing those
 * names made every insert fail with a PostgREST 400.
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
    const { conversation_id, rating, comment } = body;
    const messageIndex = Number(body.message_index);

    if (!conversation_id) {
      return NextResponse.json(
        { error: "conversation_id is required" },
        { status: 400 }
      );
    }

    if (!Number.isInteger(messageIndex) || messageIndex < 0) {
      return NextResponse.json(
        { error: "message_index must be a non-negative integer" },
        { status: 400 }
      );
    }

    if (!rating || !["up", "down"].includes(rating)) {
      return NextResponse.json(
        { error: "rating must be 'up' or 'down'" },
        { status: 400 }
      );
    }

    // Verify user owns the conversation
    const { data: conversation } = await (admin as any)
      .from("chat_conversations")
      .select("id, user_id, organization_id")
      .eq("id", conversation_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!conversation) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    // Get user's organization_id
    const { data: userProfile } = await (admin as any)
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .maybeSingle();

    // Re-rating the same message replaces the previous vote rather than
    // stacking duplicate rows (the table has no unique constraint).
    await (admin as any)
      .from("chat_feedback")
      .delete()
      .eq("conversation_id", conversation_id)
      .eq("message_index", messageIndex)
      .eq("created_by", user.id);

    const { error: insertError } = await (admin as any)
      .from("chat_feedback")
      .insert({
        conversation_id,
        message_index: messageIndex,
        created_by: user.id,
        organization_id: userProfile?.organization_id || conversation.organization_id,
        rating,
        comment: comment?.substring(0, 1000) || null,
      });

    if (insertError) {
      console.error("[chat/feedback] Insert error:", insertError);
      return NextResponse.json(
        { error: "Failed to save feedback" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, rating, message_index: messageIndex });
  } catch (err: any) {
    console.error("[chat/feedback] Error:", err?.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
