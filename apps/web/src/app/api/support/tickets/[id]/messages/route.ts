import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("users")
      .select("is_superadmin, organization_id")
      .eq("id", user.id)
      .single();

    const isSuperAdmin = profile?.is_superadmin === true;

    // Fetch ticket for IDOR check
    const { data: ticket } = await (admin as any)
      .from("support_tickets")
      .select("id, user_id, status")
      .eq("id", id)
      .single();

    if (!ticket) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    if (!isSuperAdmin && ticket.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { content, attachments } = body;

    if (!content?.trim()) {
      return NextResponse.json({ error: "Content is required" }, { status: 400 });
    }

    const senderRole = isSuperAdmin ? "admin" : "user";

    // Create message
    const { data: message, error: msgError } = await (admin as any)
      .from("support_messages")
      .insert({
        ticket_id: id,
        sender_id: user.id,
        sender_role: senderRole,
        content: content.trim(),
        attachments: attachments || [],
      })
      .select()
      .single();

    if (msgError) {
      console.error("[Support] Message error:", msgError);
      return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
    }

    // Update ticket timestamps
    const ticketUpdates: Record<string, any> = {};
    if (isSuperAdmin) {
      ticketUpdates.last_admin_reply_at = new Date().toISOString();
    } else {
      ticketUpdates.last_user_reply_at = new Date().toISOString();
      // If user replies to a resolved ticket, reopen it
      if (ticket.status === "resolved") {
        ticketUpdates.status = "open";
      }
    }

    await (admin as any)
      .from("support_tickets")
      .update(ticketUpdates)
      .eq("id", id);

    return NextResponse.json({ success: true, message }, { status: 201 });
  } catch (error) {
    console.error("[Support] Message error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
