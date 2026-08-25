import { after, NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  alertSupportDesk,
  alertTicketOwner,
  displayName,
} from "../../support-notifications";
import { validateSupportAttachments } from "../../attachment-utils";

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
      .select("id, user_id, status, subject, organization_id")
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

    // Validate attachments: file paths must belong to THIS ticket's org+ticket
    // folder in the private `support` bucket — otherwise a crafted path leaks a
    // cross-org file (signed later) or a foreign field reaches the superadmin.
    const attCheck = validateSupportAttachments(attachments, {
      organizationId: ticket.organization_id,
      ticketId: ticket.id,
    });
    if (!attCheck.ok) {
      return NextResponse.json({ error: attCheck.error }, { status: 400 });
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
        attachments: attCheck.attachments,
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

    const { error: ticketUpdateError } = await (admin as any)
      .from("support_tickets")
      .update(ticketUpdates)
      .eq("id", id);

    if (ticketUpdateError) {
      // Non-fatal: the message IS stored. Only the unread badge is stale.
      console.error("[Support] Ticket timestamp update failed:", ticketUpdateError.message);
    }

    // ── Notifications (support_reply) — never block the response ───────────
    // Resend has a 10s timeout and alertSupportDesk emails every superadmin
    // sequentially, so awaiting here added seconds of latency to the reply.
    // after() runs it once the response is already flushed.
    const body_text = content.trim();
    after(async () => {
      try {
        if (senderRole === "admin") {
          // The desk answered → tell the customer.
          await alertTicketOwner(admin, {
            recipientId: ticket.user_id,
            actorId: user.id,
            ticketId: id,
            ticketSubject: ticket.subject || "",
            message: body_text,
          });
        } else {
          // The customer answered → wake the desk up.
          const { data: authorProfile } = await (admin as any)
            .from("users")
            .select("first_name, last_name, email")
            .eq("id", user.id)
            .maybeSingle();

          await alertSupportDesk(admin, {
            organizationId: ticket.organization_id ?? null,
            ticketId: id,
            ticketSubject: ticket.subject || "",
            message: body_text,
            kind: "replied",
            authorName: displayName(authorProfile),
          });
        }
      } catch (err) {
        console.error("[Support] Notification failed:", err);
      }
    });

    return NextResponse.json({ success: true, message }, { status: 201 });
  } catch (error) {
    console.error("[Support] Message error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
