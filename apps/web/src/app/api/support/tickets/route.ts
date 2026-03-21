import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();

    // Check if superadmin
    const { data: profile } = await admin
      .from("users")
      .select("is_superadmin, organization_id")
      .eq("id", user.id)
      .single();

    const isSuperAdmin = profile?.is_superadmin === true;
    const { searchParams } = request.nextUrl;
    const status = searchParams.get("status");
    const category = searchParams.get("category");
    const priority = searchParams.get("priority");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200);
    const offset = (page - 1) * limit;

    let query = (admin as any)
      .from("support_tickets")
      .select("*, users!support_tickets_user_id_fkey(first_name, last_name, email), organizations!support_tickets_organization_id_fkey(name)", { count: "exact" });

    if (!isSuperAdmin) {
      query = query.eq("user_id", user.id);
    }

    if (status) query = query.eq("status", status);
    if (category) query = query.eq("category", category);
    if (priority) query = query.eq("priority", priority);

    query = query.order("updated_at", { ascending: false }).range(offset, offset + limit - 1);

    const { data: tickets, error, count } = await query;

    if (error) {
      console.error("[Support] List error:", error);
      return NextResponse.json({ error: "Failed to fetch tickets" }, { status: 500 });
    }

    // Get message counts per ticket
    const ticketIds = (tickets || []).map((t: any) => t.id);
    let messageCounts: Record<string, number> = {};

    if (ticketIds.length > 0) {
      const { data: counts } = await (admin as any)
        .from("support_messages")
        .select("ticket_id")
        .in("ticket_id", ticketIds);

      if (counts) {
        for (const c of counts) {
          messageCounts[c.ticket_id] = (messageCounts[c.ticket_id] || 0) + 1;
        }
      }
    }

    const enriched = (tickets || []).map((t: any) => ({
      ...t,
      message_count: messageCounts[t.id] || 0,
      user_name: t.users ? `${t.users.first_name || ""} ${t.users.last_name || ""}`.trim() : "",
      user_email: t.users?.email || "",
      org_name: t.organizations?.name || "",
    }));

    return NextResponse.json({
      success: true,
      tickets: enriched,
      total: count || 0,
      page,
      limit,
    });
  } catch (error) {
    console.error("[Support] List error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    if (!profile?.organization_id) {
      return NextResponse.json({ error: "No organization" }, { status: 400 });
    }

    const body = await request.json();
    const { subject, category, priority, message, attachments } = body;

    // Validation
    if (!subject?.trim() || subject.length > 200) {
      return NextResponse.json({ error: "Subject is required (max 200 chars)" }, { status: 400 });
    }
    if (!["bug", "question", "feature_request", "billing"].includes(category)) {
      return NextResponse.json({ error: "Invalid category" }, { status: 400 });
    }
    if (!["low", "medium", "high"].includes(priority || "medium")) {
      return NextResponse.json({ error: "Invalid priority" }, { status: 400 });
    }
    if (!message?.trim() || message.trim().length < 10) {
      return NextResponse.json({ error: "Message is required (min 10 chars)" }, { status: 400 });
    }

    // Create ticket
    const { data: ticket, error: ticketError } = await (admin as any)
      .from("support_tickets")
      .insert({
        user_id: user.id,
        organization_id: profile.organization_id,
        subject: subject.trim(),
        category,
        priority: priority || "medium",
        status: "open",
        last_user_reply_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (ticketError || !ticket) {
      console.error("[Support] Create ticket error:", ticketError);
      return NextResponse.json({ error: "Failed to create ticket" }, { status: 500 });
    }

    // Create first message
    const { data: msg, error: msgError } = await (admin as any)
      .from("support_messages")
      .insert({
        ticket_id: ticket.id,
        sender_id: user.id,
        sender_role: "user",
        content: message.trim(),
        attachments: attachments || [],
      })
      .select()
      .single();

    if (msgError) {
      console.error("[Support] Create message error:", msgError);
    }

    return NextResponse.json({ success: true, ticket, message: msg }, { status: 201 });
  } catch (error) {
    console.error("[Support] Create error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
