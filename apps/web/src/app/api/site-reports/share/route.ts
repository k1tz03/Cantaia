import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { randomUUID } from "crypto";

/**
 * GET /api/site-reports/share
 * Fetch the active share link for the user's organization.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();

    const { data: profile } = await (admin as any)
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.organization_id) {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }

    const { data: share } = await (admin as any)
      .from("site_report_shares")
      .select("token, expires_at, created_at")
      .eq("organization_id", profile.organization_id)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!share) {
      return NextResponse.json({ token: null });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://cantaia.io";
    const url = `${appUrl}/fr/rapports/${share.token}`;

    return NextResponse.json({
      token: share.token,
      url,
      expires_at: share.expires_at,
    });
  } catch (err: any) {
    console.error("[site-reports/share] GET error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/site-reports/share
 * Generate a new share token. Admin/Director/PM/Superadmin only.
 * Deactivates any existing active token for the org.
 */
export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();

    const { data: profile } = await (admin as any)
      .from("users")
      .select("organization_id, role, is_superadmin")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.organization_id) {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }

    // Role check: admin, director, project_manager, or superadmin
    const allowedRoles = ["admin", "director", "project_manager"];
    if (!profile.is_superadmin && !allowedRoles.includes(profile.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Deactivate existing active tokens for this org
    await (admin as any)
      .from("site_report_shares")
      .update({ is_active: false })
      .eq("organization_id", profile.organization_id)
      .eq("is_active", true);

    // Generate new token with 90-day expiry
    const token = randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 90);

    const { data: share, error: shareError } = await (admin as any)
      .from("site_report_shares")
      .insert({
        organization_id: profile.organization_id,
        token,
        created_by: user.id,
        expires_at: expiresAt.toISOString(),
        is_active: true,
      })
      .select("token, expires_at")
      .single();

    if (shareError || !share) {
      console.error("[site-reports/share] Insert error:", shareError);
      return NextResponse.json({ error: "Failed to create share link" }, { status: 500 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://cantaia.io";
    const url = `${appUrl}/fr/rapports/${share.token}`;

    return NextResponse.json({
      success: true,
      token: share.token,
      url,
      expires_at: share.expires_at,
    });
  } catch (err: any) {
    console.error("[site-reports/share] POST error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/site-reports/share
 * Revoke all active share tokens for the org. Admin/Director/PM/Superadmin only.
 */
export async function DELETE() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();

    const { data: profile } = await (admin as any)
      .from("users")
      .select("organization_id, role, is_superadmin")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.organization_id) {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }

    // Role check: admin, director, project_manager, or superadmin
    const allowedRoles = ["admin", "director", "project_manager"];
    if (!profile.is_superadmin && !allowedRoles.includes(profile.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await (admin as any)
      .from("site_report_shares")
      .update({ is_active: false })
      .eq("organization_id", profile.organization_id)
      .eq("is_active", true);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[site-reports/share] DELETE error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
