import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// GET — List conversations for the current user
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: conversations, error } = await (admin as any)
    .from("chat_conversations")
    .select("id, title, project_id, created_at, updated_at")
    .eq("user_id", user.id)
    .eq("archived", false)
    .order("updated_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json(
      { error: "Failed to load conversations" },
      { status: 500 },
    );
  }

  return NextResponse.json({ conversations: conversations || [] });
}

// POST — Create a new empty conversation
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: userOrg } = await (admin as any)
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!userOrg?.organization_id) {
    return NextResponse.json({ error: "No organization" }, { status: 403 });
  }

  let body: { title?: string; project_id?: string } = {};
  try {
    body = await request.json();
  } catch {
    // Empty body is fine
  }

  const { data: conv, error } = await (admin as any)
    .from("chat_conversations")
    .insert({
      user_id: user.id,
      organization_id: userOrg.organization_id,
      project_id: body.project_id || null,
      title: body.title || "Nouvelle conversation",
    })
    .select("id, title, project_id, created_at, updated_at")
    .single();

  if (error) {
    return NextResponse.json(
      { error: "Failed to create conversation" },
      { status: 500 },
    );
  }

  return NextResponse.json({ conversation: conv });
}
