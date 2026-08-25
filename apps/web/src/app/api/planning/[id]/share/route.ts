import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAppUrl } from "@/lib/env";
import { randomUUID } from "crypto";

/** Locales served by the app router — share links must use the creator's own. */
const SUPPORTED_LOCALES = ["fr", "en", "de"];

/**
 * POST /api/planning/[id]/share
 * Generate a unique shareable link for a planning.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();

    const { data: userProfile } = await (admin as any)
      .from("users")
      .select("organization_id, preferred_language")
      .eq("id", user.id)
      .maybeSingle();

    if (!userProfile?.organization_id) {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }

    // Verify planning belongs to org
    const { data: planning } = await (admin as any)
      .from("project_plannings")
      .select("id, organization_id")
      .eq("id", id)
      .maybeSingle();

    if (!planning || planning.organization_id !== userProfile.organization_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Reuse the current active, non-expired link instead of minting a new token
    // on every click. Otherwise each "Share" press leaves another live token
    // behind, and closing/reopening the panel looks like a revoke when it is not.
    const nowIso = new Date().toISOString();
    const { data: existingShare } = await (admin as any)
      .from("planning_shares")
      .select("id, token, expires_at")
      .eq("planning_id", id)
      .eq("is_active", true)
      .gt("expires_at", nowIso)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let share = existingShare;

    if (!share) {
      // Generate token
      const token = randomUUID();

      // Set expiration to 30 days from now
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      const { data: created, error: shareError } = await (admin as any)
        .from("planning_shares")
        .insert({
          planning_id: id,
          token,
          created_by: user.id,
          expires_at: expiresAt.toISOString(),
          is_active: true,
        })
        .select("id, token, expires_at")
        .single();

      if (shareError || !created) {
        console.error("[planning/share] Insert error:", shareError);
        return NextResponse.json({ error: "Failed to create share link" }, { status: 500 });
      }
      share = created;
    }

    const locale = SUPPORTED_LOCALES.includes(userProfile.preferred_language)
      ? userProfile.preferred_language
      : "fr";
    const shareUrl = `${getAppUrl()}/${locale}/planning/${share.token}`;

    return NextResponse.json({
      success: true,
      token: share.token,
      url: shareUrl,
      expires_at: share.expires_at,
    });
  } catch (err: any) {
    console.error("[planning/share] POST error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/planning/[id]/share
 * Deactivate all share links for a planning.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();

    const { data: userProfile } = await (admin as any)
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!userProfile?.organization_id) {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }

    const { data: planning } = await (admin as any)
      .from("project_plannings")
      .select("id, organization_id")
      .eq("id", id)
      .maybeSingle();

    if (!planning || planning.organization_id !== userProfile.organization_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { error: revokeError } = await (admin as any)
      .from("planning_shares")
      .update({ is_active: false })
      .eq("planning_id", id);

    if (revokeError) {
      console.error("[planning/share] Revoke error:", revokeError.message);
      return NextResponse.json({ error: revokeError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[planning/share] DELETE error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
