import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseBody, validateRequired } from "@/lib/api/parse-body";
import crypto from "crypto";

/**
 * POST /api/admin/invite — Org admin invites a new member
 * body: { email, first_name?, last_name?, role?, job_title?, message? }
 */
export async function POST(request: NextRequest) {
  // Auth
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Get user profile + verify role
  const { data: userProfile } = await (admin.from("users") as any)
    .select(
      "id, organization_id, role, is_superadmin, first_name, last_name, preferred_language"
    )
    .eq("id", user.id)
    .maybeSingle();

  if (!userProfile) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const allowedRoles = ["admin", "director", "project_manager"];
  if (!allowedRoles.includes(userProfile.role) && !userProfile.is_superadmin) {
    return NextResponse.json(
      { error: "Insufficient permissions" },
      { status: 403 }
    );
  }

  if (!userProfile.organization_id) {
    return NextResponse.json(
      { error: "No organization found" },
      { status: 400 }
    );
  }

  // Parse body
  const { data: body, error: parseError } = await parseBody(request);
  if (parseError || !body) {
    return NextResponse.json(
      { error: parseError || "Invalid request" },
      { status: 400 }
    );
  }

  const validationError = validateRequired(body, ["email"]);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const { email, first_name, last_name, role, job_title, message } = body;

  // Get org info
  const { data: org } = await (admin.from("organizations") as any)
    .select("id, name, subdomain, max_users")
    .eq("id", userProfile.organization_id)
    .maybeSingle();

  if (!org) {
    return NextResponse.json(
      { error: "Organization not found" },
      { status: 404 }
    );
  }

  // Check max_users limit
  const { count: currentMembers } = await (admin.from("users") as any)
    .select("id", { count: "exact", head: true })
    .eq("organization_id", org.id);

  if (currentMembers && org.max_users && currentMembers >= org.max_users) {
    return NextResponse.json(
      { error: "User limit reached for this organization" },
      { status: 403 }
    );
  }

  // Check if email already has a pending invite
  const { data: existingInvite } = await (
    admin.from("organization_invites") as any
  )
    .select("id")
    .eq("organization_id", org.id)
    .eq("email", email)
    .eq("status", "pending")
    .maybeSingle();

  if (existingInvite) {
    return NextResponse.json(
      { error: "An invitation is already pending for this email" },
      { status: 409 }
    );
  }

  // Check if email is already a member
  const { data: existingUser } = await (admin.from("users") as any)
    .select("id")
    .eq("organization_id", org.id)
    .eq("email", email)
    .maybeSingle();

  if (existingUser) {
    return NextResponse.json(
      { error: "This user is already a member of the organization" },
      { status: 409 }
    );
  }

  // Generate token
  const token = crypto.randomBytes(32).toString("hex");

  // Insert invite
  const { data: invite, error: insertError } = await (
    admin.from("organization_invites") as any
  )
    .insert({
      organization_id: org.id,
      email,
      first_name: first_name || null,
      last_name: last_name || null,
      role: role || "member",
      job_title: job_title || null,
      token,
      message: message || null,
      invited_by: user.id,
    })
    .select()
    .single();

  if (insertError) {
    console.error("[admin/invite] Insert error:", insertError);
    return NextResponse.json(
      { error: insertError.message },
      { status: 500 }
    );
  }

  // Send email via Resend (fire-and-forget)
  if (process.env.RESEND_API_KEY) {
    const { sendInviteEmail } = await import(
      "@cantaia/core/emails/invite"
    );
    const inviterName = userProfile.first_name
      ? `${userProfile.first_name} ${userProfile.last_name || ""}`.trim()
      : "Admin";

    sendInviteEmail({
      resendApiKey: process.env.RESEND_API_KEY,
      inviteeEmail: email,
      inviterName,
      organizationName: org.name || "Organisation",
      subdomain: org.subdomain,
      role: role || "member",
      message: message || undefined,
      token,
      locale: userProfile.preferred_language || "fr",
    }).catch((err: unknown) =>
      console.error("[admin/invite] Email send error:", err)
    );
  }

  return NextResponse.json({ success: true, invite });
}
