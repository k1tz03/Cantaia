// ============================================================
// Cantaia — Org Admin Auth Guard
// ============================================================
// Shared guard for organization-management API routes (Stripe billing,
// member management, branding, admin dashboards).
//
// Authorization rule: users.role ∈ ORG_ADMIN_ROLES OR users.is_superadmin.

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/** Roles allowed to manage the organization (billing, members, branding). */
export const ORG_ADMIN_ROLES = ["admin", "director"] as const;

/**
 * Roles that can be assigned to organization members (invites, role changes).
 * Single source of truth — used by /api/admin/invite, /api/invites and
 * /api/admin/members/[id].
 */
export const ASSIGNABLE_ROLES = [
  "member",
  "foreman",
  "site_manager",
  "project_manager",
  "director",
  "admin",
] as const;

export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export function isAssignableRole(role: unknown): role is AssignableRole {
  return (
    typeof role === "string" &&
    (ASSIGNABLE_ROLES as readonly string[]).includes(role)
  );
}

export interface OrgAdminProfile {
  id: string;
  organization_id: string | null;
  role: string | null;
  is_superadmin: boolean;
  email: string | null;
  preferred_language: string | null;
}

export type OrgAdminCheck =
  | { authorized: true; profile: OrgAdminProfile & { organization_id: string } }
  | { authorized: false; status: 401 | 403 | 400; error: string };

/**
 * Verify the current user is an org admin (role admin/director) or superadmin,
 * and belongs to an organization. Returns the profile on success.
 *
 * @param userId Optional — pass the already-authenticated user id to skip the
 *               session lookup. When omitted, the session is resolved here.
 */
export async function requireOrgAdmin(userId?: string): Promise<OrgAdminCheck> {
  try {
    let uid = userId;

    if (!uid) {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        return { authorized: false, status: 401, error: "Unauthorized" };
      }
      uid = user.id;
    }

    const admin = createAdminClient();
    const { data: profile } = await (admin as any)
      .from("users")
      .select("id, organization_id, role, is_superadmin, email, preferred_language")
      .eq("id", uid)
      .maybeSingle();

    if (!profile) {
      return { authorized: false, status: 403, error: "User not found" };
    }

    const isOrgAdmin =
      (ORG_ADMIN_ROLES as readonly string[]).includes(profile.role || "") ||
      profile.is_superadmin === true;

    if (!isOrgAdmin) {
      return { authorized: false, status: 403, error: "Insufficient permissions" };
    }

    if (!profile.organization_id) {
      return { authorized: false, status: 400, error: "No organization" };
    }

    return {
      authorized: true,
      profile: {
        id: profile.id,
        organization_id: profile.organization_id,
        role: profile.role ?? null,
        is_superadmin: profile.is_superadmin === true,
        email: profile.email ?? null,
        preferred_language: profile.preferred_language ?? null,
      },
    };
  } catch {
    return { authorized: false, status: 401, error: "Auth check failed" };
  }
}
