import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/email/[id]/archive
 * Archive an email to Supabase Storage.
 * Stores email content as .eml in the email-archives bucket.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Get email with all data
  const { data: email } = await (admin as any)
    .from("emails")
    .select("*, projects:project_id(name, code, organization_id)")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!email) {
    return NextResponse.json({ error: "Email not found" }, { status: 404 });
  }

  // Build .eml-like content (simplified)
  const senderEmail = email.from_email || email.sender_email || "";
  const senderName = email.from_name || email.sender_name || "";
  const toEmails = email.to_emails?.join(", ") || email.recipients?.join(", ") || "";
  const ccEmails = email.cc_emails?.join(", ") || "";
  const subject = email.subject || "(Sans objet)";
  const bodyText = email.body_text || email.body_preview || "";
  const bodyHtml = email.body_html || "";
  const receivedAt = email.received_at || new Date().toISOString();

  const emlContent = [
    `From: ${senderName} <${senderEmail}>`,
    `To: ${toEmails}`,
    ccEmails ? `Cc: ${ccEmails}` : null,
    `Subject: ${subject}`,
    `Date: ${new Date(receivedAt).toUTCString()}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/html; charset=utf-8`,
    ``,
    bodyHtml || bodyText,
  ].filter(Boolean).join("\r\n");

  // Build storage path
  const orgId = email.projects?.organization_id || "unknown";
  const projectRef = email.projects?.code || email.projects?.name || "unclassified";
  const yearMonth = receivedAt.substring(0, 7); // YYYY-MM
  const sanitizedSubject = subject
    .replace(/[^a-zA-Z0-9àâäéèêëïîôùûüçÀÂÄÉÈÊËÏÎÔÙÛÜÇ\s-]/g, "")
    .replace(/\s+/g, "_")
    .substring(0, 80);
  const storagePath = `${orgId}/${projectRef}/${yearMonth}/${sanitizedSubject}_${id.substring(0, 8)}.eml`;

  // Upload to Supabase Storage
  const { error: uploadErr } = await admin.storage
    .from("email-archives")
    .upload(storagePath, emlContent, {
      contentType: "message/rfc822",
      upsert: true,
    });

  if (uploadErr) {
    console.error("[email/archive] Upload error:", uploadErr.message);
    return NextResponse.json({ error: `Archive failed: ${uploadErr.message}` }, { status: 500 });
  }

  // Update email record
  await (admin as any)
    .from("emails")
    .update({ archived_path: storagePath })
    .eq("id", id);

  return NextResponse.json({ success: true, path: storagePath });
}
