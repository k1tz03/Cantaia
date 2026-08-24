import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const SIGNED_URL_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

/**
 * The `support` bucket is private. Attachments store the storage path in
 * `file_url` (new uploads) or a legacy public URL (old rows). Extract the
 * bucket-relative path so it can be resolved to a signed URL at read time.
 */
function extractStoragePath(fileUrl: string | undefined | null): string | null {
  if (!fileUrl) return null;
  if (!/^https?:\/\//i.test(fileUrl)) return fileUrl; // already a path
  // Legacy rows: .../storage/v1/object/public/support/<path> (or /sign/)
  const match = fileUrl.match(/\/object\/(?:public|sign)\/support\/([^?]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Replace attachment paths with 7-day signed URLs (in place).
 * Fails soft: unresolvable attachments keep their stored value.
 */
async function signAttachmentUrls(admin: any, messages: any[]): Promise<void> {
  const paths = new Set<string>();
  for (const msg of messages) {
    for (const att of msg.attachments || []) {
      const path = extractStoragePath(att?.file_url);
      if (path) paths.add(path);
    }
  }
  if (paths.size === 0) return;

  try {
    const { data: signed } = await admin.storage
      .from("support")
      .createSignedUrls([...paths], SIGNED_URL_TTL_SECONDS);
    const signedByPath = new Map<string, string>();
    for (const entry of signed || []) {
      if (entry?.path && entry?.signedUrl) signedByPath.set(entry.path, entry.signedUrl);
    }
    for (const msg of messages) {
      for (const att of msg.attachments || []) {
        const path = extractStoragePath(att?.file_url);
        const url = path ? signedByPath.get(path) : undefined;
        if (url) att.file_url = url;
      }
    }
  } catch (err) {
    console.error("[Support] Signed URL generation failed:", err);
  }
}

export async function GET(
  _request: NextRequest,
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

    // Fetch ticket (no FK joins to avoid constraint name issues)
    const { data: ticket, error: ticketError } = await (admin as any)
      .from("support_tickets")
      .select("*")
      .eq("id", id)
      .single();

    if (ticketError || !ticket) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    // IDOR check
    if (!isSuperAdmin && ticket.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Enrich with user/org info
    const { data: ticketUser } = await admin
      .from("users")
      .select("first_name, last_name, email")
      .eq("id", ticket.user_id)
      .single();

    const { data: ticketOrg } = await admin
      .from("organizations")
      .select("name, subscription_plan")
      .eq("id", ticket.organization_id)
      .single();

    // Fetch messages
    const { data: messages } = await (admin as any)
      .from("support_messages")
      .select("*")
      .eq("ticket_id", id)
      .order("created_at", { ascending: true });

    // Resolve attachment storage paths to signed URLs (private bucket)
    await signAttachmentUrls(admin, messages || []);

    // Update last_read_at or last_admin_read_at
    const updateField = isSuperAdmin ? "last_admin_read_at" : "last_read_at";
    await (admin as any)
      .from("support_tickets")
      .update({ [updateField]: new Date().toISOString() })
      .eq("id", id);

    return NextResponse.json({
      success: true,
      ticket: {
        ...ticket,
        user_name: ticketUser ? `${ticketUser.first_name || ""} ${ticketUser.last_name || ""}`.trim() : "",
        user_email: ticketUser?.email || "",
        org_name: ticketOrg?.name || "",
        org_plan: ticketOrg?.subscription_plan || "trial",
      },
      messages: messages || [],
    });
  } catch (error) {
    console.error("[Support] Detail error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(
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
      .select("is_superadmin")
      .eq("id", user.id)
      .single();

    if (!profile?.is_superadmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const updates: Record<string, string> = {};

    if (body.status) {
      if (!["open", "in_progress", "resolved", "closed"].includes(body.status)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }
      updates.status = body.status;
    }

    if (body.priority) {
      if (!["low", "medium", "high"].includes(body.priority)) {
        return NextResponse.json({ error: "Invalid priority" }, { status: 400 });
      }
      updates.priority = body.priority;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No updates provided" }, { status: 400 });
    }

    const { data: ticket, error } = await (admin as any)
      .from("support_tickets")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("[Support] Update error:", error);
      return NextResponse.json({ error: "Failed to update ticket" }, { status: 500 });
    }

    return NextResponse.json({ success: true, ticket });
  } catch (error) {
    console.error("[Support] Update error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
