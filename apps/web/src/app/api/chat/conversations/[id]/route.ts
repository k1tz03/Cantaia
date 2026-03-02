import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// GET — Load messages for a conversation
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Verify ownership
  const { data: conv } = await (admin as any)
    .from("chat_conversations")
    .select("id, user_id")
    .eq("id", id)
    .maybeSingle();

  if (!conv || conv.user_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: messages, error } = await (admin as any)
    .from("chat_messages")
    .select("id, role, content, model, input_tokens, output_tokens, created_at")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: "Failed to load messages" },
      { status: 500 },
    );
  }

  return NextResponse.json({ messages: messages || [] });
}

// DELETE — Archive a conversation (soft delete)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Verify ownership
  const { data: conv } = await (admin as any)
    .from("chat_conversations")
    .select("id, user_id")
    .eq("id", id)
    .maybeSingle();

  if (!conv || conv.user_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { error } = await (admin as any)
    .from("chat_conversations")
    .update({ archived: true })
    .eq("id", id);

  if (error) {
    return NextResponse.json(
      { error: "Failed to archive conversation" },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}
