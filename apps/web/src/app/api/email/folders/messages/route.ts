import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getValidMicrosoftToken } from "@/lib/microsoft/tokens";

/**
 * GET /api/email/folders/messages?folder_id=xxx&top=50
 * Fetch messages from a specific Outlook folder (Sent Items, Deleted Items, custom folders).
 *
 * Well-known folder names can also be used: "sentitems", "deleteditems", "drafts", "junkemail"
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const folderId = request.nextUrl.searchParams.get("folder_id");
  const top = Math.min(Number(request.nextUrl.searchParams.get("top") || "50"), 100);

  if (!folderId) {
    return NextResponse.json({ error: "folder_id is required" }, { status: 400 });
  }

  const tokenResult = await getValidMicrosoftToken(user.id);
  if (tokenResult.error) {
    return NextResponse.json({ error: tokenResult.error }, { status: 400 });
  }

  try {
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/me/mailFolders/${encodeURIComponent(folderId)}/messages?$top=${top}&$orderby=receivedDateTime desc&$select=id,subject,from,toRecipients,ccRecipients,receivedDateTime,bodyPreview,isRead,hasAttachments`,
      { headers: { Authorization: `Bearer ${tokenResult.accessToken}` } }
    );

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      return NextResponse.json(
        { error: (errData as any).error?.message || "Failed to fetch messages" },
        { status: res.status }
      );
    }

    const data = await res.json();
    const messages = (data.value || []).map((m: any) => ({
      id: m.id,
      subject: m.subject || "(Sans objet)",
      sender_name: m.from?.emailAddress?.name || "",
      sender_email: m.from?.emailAddress?.address || "",
      recipients: (m.toRecipients || []).map((r: any) => r.emailAddress?.address).filter(Boolean),
      cc: (m.ccRecipients || []).map((r: any) => r.emailAddress?.address).filter(Boolean),
      received_at: m.receivedDateTime,
      body_preview: m.bodyPreview || "",
      is_read: m.isRead,
      has_attachments: m.hasAttachments,
    }));

    return NextResponse.json({ success: true, messages });
  } catch (err) {
    return NextResponse.json(
      { error: `Message fetch failed: ${err instanceof Error ? err.message : "Unknown"}` },
      { status: 500 }
    );
  }
}
