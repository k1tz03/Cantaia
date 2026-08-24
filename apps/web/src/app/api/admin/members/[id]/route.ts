import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  requireOrgAdmin,
  isAssignableRole,
  ASSIGNABLE_ROLES,
} from "@/lib/admin/require-org-admin";

/**
 * Member management for org admins. RLS blocks direct browser writes on
 * `users`, so AdminMembersTab goes through these server routes (admin client).
 *
 * PATCH  /api/admin/members/[id] — change a member's role
 * DELETE /api/admin/members/[id] — remove a member from the organization
 */

async function fetchTarget(admin: ReturnType<typeof createAdminClient>, id: string) {
  const { data } = await (admin as any)
    .from("users")
    .select("id, organization_id, role, is_superadmin")
    .eq("id", id)
    .maybeSingle();
  return data as
    | { id: string; organization_id: string | null; role: string | null; is_superadmin: boolean }
    | null;
}

async function countOtherAdmins(
  admin: ReturnType<typeof createAdminClient>,
  organizationId: string,
  excludeUserId: string
): Promise<number> {
  const { count } = await (admin as any)
    .from("users")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("role", "admin")
    .neq("id", excludeUserId);
  return count || 0;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const check = await requireOrgAdmin();
    if (!check.authorized) {
      return NextResponse.json({ error: check.error }, { status: check.status });
    }

    const body = await request.json().catch(() => null);
    const role = body?.role;

    if (!isAssignableRole(role)) {
      return NextResponse.json(
        { error: `Invalid role. Allowed: ${ASSIGNABLE_ROLES.join(", ")}` },
        { status: 400 }
      );
    }

    const admin = createAdminClient();
    const target = await fetchTarget(admin, id);

    if (!target || target.organization_id !== check.profile.organization_id) {
      // Same 404 whether the user doesn't exist or belongs to another org
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    // Never leave the organization without an admin
    if (target.role === "admin" && role !== "admin") {
      const otherAdmins = await countOtherAdmins(
        admin,
        check.profile.organization_id,
        target.id
      );
      if (otherAdmins === 0) {
        return NextResponse.json(
          { error: "Cannot demote the last admin of the organization" },
          { status: 400 }
        );
      }
    }

    const { error: updateError } = await (admin as any)
      .from("users")
      .update({ role })
      .eq("id", target.id)
      .eq("organization_id", check.profile.organization_id);

    if (updateError) {
      console.error("[admin/members] Role update error:", updateError.message);
      return NextResponse.json({ error: "Failed to update role" }, { status: 500 });
    }

    return NextResponse.json({ success: true, role });
  } catch (error) {
    console.error("[admin/members] PATCH error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const check = await requireOrgAdmin();
    if (!check.authorized) {
      return NextResponse.json({ error: check.error }, { status: check.status });
    }

    // An admin cannot remove themselves
    if (id === check.profile.id) {
      return NextResponse.json(
        { error: "You cannot remove yourself from the organization" },
        { status: 400 }
      );
    }

    const admin = createAdminClient();
    const target = await fetchTarget(admin, id);

    if (!target || target.organization_id !== check.profile.organization_id) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    // Never leave the organization without an admin
    if (target.role === "admin") {
      const otherAdmins = await countOtherAdmins(
        admin,
        check.profile.organization_id,
        target.id
      );
      if (otherAdmins === 0) {
        return NextResponse.json(
          { error: "Cannot remove the last admin of the organization" },
          { status: 400 }
        );
      }
    }

    // Removal = detach from the organization (data is preserved)
    const { error: deleteError } = await (admin as any)
      .from("users")
      .update({ organization_id: null })
      .eq("id", target.id)
      .eq("organization_id", check.profile.organization_id);

    if (deleteError) {
      console.error("[admin/members] Remove error:", deleteError.message);
      return NextResponse.json({ error: "Failed to remove member" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[admin/members] DELETE error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
