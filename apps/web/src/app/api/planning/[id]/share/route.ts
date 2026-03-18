import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { randomUUID } from "crypto";

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
      .select("organization_id")
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

    // Generate token
    const token = randomUUID();

    // Set expiration to 30 days from now
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    const { data: share, error: shareError } = await (admin as any)
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

    if (shareError || !share) {
      console.error("[planning/share] Insert error:", shareError);
      return NextResponse.json({ error: "Failed to create share link" }, { status: 500 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://cantaia.ch";
    const shareUrl = `${appUrl}/fr/planning/${token}`;

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

    await (admin as any)
      .from("planning_shares")
      .update({ is_active: false })
      .eq("planning_id", id);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[planning/share] DELETE error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
