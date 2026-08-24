import { NextResponse } from "next/server";
import { requireOrgAdmin } from "@/lib/admin/require-org-admin";

/**
 * GET /api/admin/check-access
 * Minimal guard endpoint for the (admin) route group layout: answers whether
 * the current user may access the org admin panel (role admin/director or
 * superadmin). Returns 401/403 otherwise.
 */
export async function GET() {
  const check = await requireOrgAdmin();
  if (!check.authorized) {
    return NextResponse.json({ authorized: false, error: check.error }, { status: check.status });
  }
  return NextResponse.json({
    authorized: true,
    role: check.profile.role,
    is_superadmin: check.profile.is_superadmin,
  });
}
