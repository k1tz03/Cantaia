import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/chat/feedback
 * Store user feedback (thumbs up/down) on a chat AI message.
 * Body: { message_id, conversation_id, rating: 'up' | 'down', comment?: string }
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
    const { message_id, conversation_id, rating, comment } = body;

    if (!message_id || !conversation_id) {
      return NextResponse.json(
        { error: "message_id and conversation_id are required" },
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

    // Insert feedback into chat_feedback table
    const { error: insertError } = await (admin as any)
      .from("chat_feedback")
      .insert({
        message_id,
        conversation_id,
        user_id: user.id,
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

    return NextResponse.json({ success: true, rating });
  } catch (err: any) {
    console.error("[chat/feedback] Error:", err?.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
