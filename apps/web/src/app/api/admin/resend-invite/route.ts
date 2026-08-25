import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOrgAdmin } from "@/lib/admin/require-org-admin";
import { parseBody, validateRequired } from "@/lib/api/parse-body";
import crypto from "crypto";

/**
 * POST /api/admin/resend-invite — re-send a pending invitation.
 * body: { invite_id }
 *
 * Runs server-side (admin client) and, crucially, REUSES the invitation's
 * stored role. The previous client-side resend hardcoded role:"member",
 * silently downgrading an admin/director invitation, and never checked the
 * response so it showed success on 409/500 too.
 */
export async function POST(request: NextRequest) {
  const check = await requireOrgAdmin();
  if (!check.authorized) {
    return NextResponse.json({ error: check.error }, { status: check.status });
  }

  const { data: body, error: parseError } = await parseBody(request);
  if (parseError || !body) {
    return NextResponse.json({ error: parseError || "Invalid request" }, { status: 400 });
  }

  const validationError = validateRequired(body, ["invite_id"]);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const admin = createAdminClient();
  const orgId = check.profile.organization_id;

  // Load the invite and verify it belongs to the caller's org (anti-IDOR).
  const { data: invite, error: loadError } = await (
    admin.from("organization_invites") as any
  )
    .select("id, organization_id, email, first_name, last_name, role, job_title, message")
    .eq("id", body.invite_id)
    .maybeSingle();

  if (loadError) {
    console.error("[admin/resend-invite] Load error:", loadError.message);
    return NextResponse.json({ error: "Failed to load invitation" }, { status: 500 });
  }
  if (!invite || invite.organization_id !== orgId) {
    return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
  }

  // Fresh token + reset expiry + back to pending, keeping the original role.
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { error: updateError } = await (
    admin.from("organization_invites") as any
  )
    .update({
      token,
      status: "pending",
      expires_at: expiresAt,
      accepted_at: null,
      invited_by: check.profile.id,
    })
    .eq("id", invite.id);

  if (updateError) {
    console.error("[admin/resend-invite] Update error:", updateError.message);
    return NextResponse.json({ error: "Failed to refresh invitation" }, { status: 500 });
  }

  // Send the email (fire-and-forget) with the ORIGINAL role.
  if (process.env.RESEND_API_KEY) {
    const { data: org } = await (admin.from("organizations") as any)
      .select("name, subdomain")
      .eq("id", orgId)
      .maybeSingle();

    const { data: inviter } = await (admin.from("users") as any)
      .select("first_name, last_name")
      .eq("id", check.profile.id)
      .maybeSingle();
    const inviterName = inviter?.first_name
      ? `${inviter.first_name} ${inviter.last_name || ""}`.trim()
      : "Admin";

    const { sendInviteEmail } = await import("@cantaia/core/emails/invite");
    sendInviteEmail({
      resendApiKey: process.env.RESEND_API_KEY,
      inviteeEmail: invite.email,
      inviterName,
      organizationName: org?.name || "Organisation",
      subdomain: org?.subdomain,
      role: invite.role || "member",
      message: invite.message || undefined,
      token,
      locale: check.profile.preferred_language || "fr",
    }).catch((err: unknown) =>
      console.error("[admin/resend-invite] Email send error:", err)
    );
  }

  return NextResponse.json({ success: true });
}
