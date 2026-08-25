import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { orgHasNightlyAgents } from "@cantaia/config/plan-features";

export const maxDuration = 15;

/**
 * PATCH /api/agents/settings
 * Body: { nightly_agents: boolean }
 *
 * Org-level switch for the autonomous nightly agents, stored in
 * `organizations.settings.nightly_agents` (migration 016 added the JSONB
 * column). Absent key = enabled, so nothing changes for existing orgs.
 *
 * Admins/directors only — this decides whether the whole organization burns
 * tokens every night.
 */
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();

    const { data: profile } = await (admin as any)
      .from("users")
      .select("organization_id, role, is_superadmin")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.organization_id) {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }

    const isOrgAdmin =
      profile.role === "admin" ||
      profile.role === "director" ||
      profile.is_superadmin === true;
    if (!isOrgAdmin) {
      return NextResponse.json(
        { error: "Seul un administrateur ou un directeur peut modifier ce réglage." },
        { status: 403 }
      );
    }

    let body: { nightly_agents?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    if (typeof body.nightly_agents !== "boolean") {
      return NextResponse.json(
        { error: "nightly_agents must be a boolean" },
        { status: 400 }
      );
    }

    // Read-modify-write: `settings` holds unrelated keys that must survive.
    const { data: org } = await (admin as any)
      .from("organizations")
      .select("settings")
      .eq("id", profile.organization_id)
      .maybeSingle();

    const nextSettings = {
      ...(org?.settings && typeof org.settings === "object" ? org.settings : {}),
      nightly_agents: body.nightly_agents,
    };

    const { error } = await (admin as any)
      .from("organizations")
      .update({ settings: nextSettings })
      .eq("id", profile.organization_id);

    if (error) {
      console.error("[agents/settings] Update failed:", error.message);
      return NextResponse.json(
        { error: "Impossible d'enregistrer le réglage" },
        { status: 500 }
      );
    }

    const planAllows = await orgHasNightlyAgents(admin, profile.organization_id);

    return NextResponse.json({
      success: true,
      nightly: {
        org_enabled: body.nightly_agents,
        plan_allows: planAllows,
        effective: planAllows && body.nightly_agents,
      },
    });
  } catch (error) {
    console.error("[agents/settings] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
