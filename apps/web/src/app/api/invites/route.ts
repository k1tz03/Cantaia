import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseBody, validateRequired } from "@/lib/api/parse-body";

/**
 * GET /api/invites?token=xxx — Verify invite token
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: invite, error } = await (admin.from("organization_invites") as any)
    .select("*, organizations(id, name, display_name, subdomain, branding)")
    .eq("token", token)
    .maybeSingle();

  if (error || !invite) {
    return NextResponse.json({ error: "Invalid token", valid: false }, { status: 404 });
  }

  // Check status
  if (invite.status !== "pending") {
    return NextResponse.json({
      valid: false,
      reason: invite.status === "accepted" ? "already_accepted" : invite.status,
    });
  }

  // Check expiry
  if (new Date(invite.expires_at) < new Date()) {
    return NextResponse.json({ valid: false, reason: "expired" });
  }

  return NextResponse.json({
    valid: true,
    invite: {
      id: invite.id,
      email: invite.email,
      first_name: invite.first_name,
      last_name: invite.last_name,
      role: invite.role,
      job_title: invite.job_title,
      message: invite.message,
      organization: invite.organizations,
    },
  });
}

/**
 * POST /api/invites — Accept invite (after user registration in Supabase Auth)
 * body: { token, user_id }
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: body, error: parseError } = await parseBody(request);
  if (parseError || !body) {
    return NextResponse.json({ error: parseError || "Invalid request" }, { status: 400 });
  }

  const validationError = validateRequired(body, ["token", "user_id"]);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const { token, user_id } = body;

  // Prevent privilege escalation: caller can only accept invites for their own user_id
  if (user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();

  // Get invite
  const { data: invite } = await (admin.from("organization_invites") as any)
    .select("id, organization_id, role, first_name, last_name, status")
    .eq("token", token)
    .eq("status", "pending")
    .maybeSingle();

  if (!invite) {
    return NextResponse.json({ error: "Invalid or expired invite" }, { status: 400 });
  }

  // Update user with organization_id and role
  const role = invite.role === "admin" ? "admin" : "project_manager";
  await (admin.from("users") as any)
    .update({
      organization_id: invite.organization_id,
      role,
      first_name: invite.first_name || undefined,
      last_name: invite.last_name || undefined,
    })
    .eq("id", user_id);

  // Mark invite as accepted
  await (admin.from("organization_invites") as any)
    .update({
      status: "accepted",
      accepted_at: new Date().toISOString(),
    })
    .eq("id", invite.id);

  return NextResponse.json({ success: true, organization_id: invite.organization_id });
}
