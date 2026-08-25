import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAppUrl } from "@/lib/env";
import { randomUUID } from "crypto";

/** Locales served by the app router — share links must use the creator's own. */
const SUPPORTED_LOCALES = ["fr", "en", "de"];

function shareLocale(preferredLanguage: unknown): string {
  return typeof preferredLanguage === "string" && SUPPORTED_LOCALES.includes(preferredLanguage)
    ? preferredLanguage
    : "fr";
}

/** Roles allowed to publish a share link. */
const ALLOWED_ROLES = ["admin", "director", "project_manager"];

/**
 * GET /api/site-reports/share
 * Fetch the active share link(s) for the user's organization.
 *
 * `?project_id=` returns the link scoped to that project (falling back to the
 * org-wide one), so the UI can show "this project" and "all projects" links
 * side by side.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();

    const { data: profile } = await (admin as any)
      .from("users")
      .select("organization_id, role, is_superadmin, preferred_language")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.organization_id) {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }

    // A share link IS the public credential: a foreman must not be able to read
    // (and then leak) it. Same roles as POST/DELETE.
    if (!profile.is_superadmin && !ALLOWED_ROLES.includes(profile.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const requestedProjectId = request.nextUrl.searchParams.get("project_id");

    // `*` on purpose: `project_id` ships with migration 100 and must stay optional.
    const { data: shares, error } = await (admin as any)
      .from("site_report_shares")
      .select("*")
      .eq("organization_id", profile.organization_id)
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[site-reports/share] GET error:", error.message);
      return NextResponse.json({ error: "Failed to fetch share link" }, { status: 500 });
    }

    const list = shares || [];
    const share = requestedProjectId
      ? list.find((s: any) => s.project_id === requestedProjectId) ||
        list.find((s: any) => !s.project_id)
      : list.find((s: any) => !s.project_id) || list[0];

    if (!share) {
      return NextResponse.json({ token: null });
    }

    const locale = shareLocale(profile.preferred_language);

    return NextResponse.json({
      token: share.token,
      url: `${getAppUrl()}/${locale}/rapports/${share.token}`,
      expires_at: share.expires_at,
      project_id: share.project_id ?? null,
      shares: list.map((s: any) => ({
        token: s.token,
        url: `${getAppUrl()}/${locale}/rapports/${s.token}`,
        expires_at: s.expires_at,
        project_id: s.project_id ?? null,
      })),
    });
  } catch (err: any) {
    console.error("[site-reports/share] GET error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/site-reports/share
 * Generate a new share token. Admin/Director/PM/Superadmin only.
 * Body (optional): { project_id } — restricts the link to a single project.
 * A link with the same scope is deactivated first (one live link per scope).
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();

    const { data: profile } = await (admin as any)
      .from("users")
      .select("organization_id, role, is_superadmin, preferred_language")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.organization_id) {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }

    if (!profile.is_superadmin && !ALLOWED_ROLES.includes(profile.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const projectId = typeof body?.project_id === "string" && body.project_id ? body.project_id : null;

    // Anti-IDOR: never scope a link to another org's project.
    if (projectId) {
      const { data: project } = await admin
        .from("projects")
        .select("id")
        .eq("id", projectId)
        .eq("organization_id", profile.organization_id)
        .maybeSingle();
      if (!project) {
        return NextResponse.json({ error: "Project not found" }, { status: 404 });
      }
    }

    // Deactivate the existing link for THIS scope only — regenerating the link
    // for one project must not revoke the org-wide one (or vice versa).
    let deactivate = (admin as any)
      .from("site_report_shares")
      .update({ is_active: false })
      .eq("organization_id", profile.organization_id)
      .eq("is_active", true);
    deactivate = projectId ? deactivate.eq("project_id", projectId) : deactivate.is("project_id", null);

    const { error: deactivateError } = await deactivate;
    if (deactivateError) {
      // Migration 100 not applied yet → no `project_id` column. Fall back to the
      // legacy behaviour (one org-wide link) rather than failing the request.
      console.warn("[site-reports/share] Scoped deactivation failed:", deactivateError.message);
      const { error: legacyError } = await (admin as any)
        .from("site_report_shares")
        .update({ is_active: false })
        .eq("organization_id", profile.organization_id)
        .eq("is_active", true);
      if (legacyError) {
        console.error("[site-reports/share] Deactivation failed:", legacyError.message);
        return NextResponse.json({ error: "Failed to create share link" }, { status: 500 });
      }
    }

    const token = randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 90);

    const insertRow: Record<string, unknown> = {
      organization_id: profile.organization_id,
      token,
      created_by: user.id,
      expires_at: expiresAt.toISOString(),
      is_active: true,
    };
    if (projectId) insertRow.project_id = projectId;

    const { data: share, error: shareError } = await (admin as any)
      .from("site_report_shares")
      .insert(insertRow)
      .select("*")
      .single();

    if (shareError || !share) {
      console.error("[site-reports/share] Insert error:", shareError);
      return NextResponse.json({ error: "Failed to create share link" }, { status: 500 });
    }

    const url = `${getAppUrl()}/${shareLocale(profile.preferred_language)}/rapports/${share.token}`;

    return NextResponse.json({
      success: true,
      token: share.token,
      url,
      expires_at: share.expires_at,
      project_id: share.project_id ?? null,
    });
  } catch (err: any) {
    console.error("[site-reports/share] POST error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/site-reports/share
 * Revoke share tokens, scoped: `?project_id=` revokes that project's link;
 * without it ONLY the org-wide (null-scope) link is revoked, so revoking the
 * "all projects" link never silently kills every project-scoped link.
 * Admin/Director/PM/Superadmin only.
 */
export async function DELETE(request: NextRequest) {
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

    if (!profile.is_superadmin && !ALLOWED_ROLES.includes(profile.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const projectId = request.nextUrl.searchParams.get("project_id");

    const base = () =>
      (admin as any)
        .from("site_report_shares")
        .update({ is_active: false })
        .eq("organization_id", profile.organization_id)
        .eq("is_active", true);

    // Scope the revoke: a project link by its id, otherwise the org-wide link
    // (project_id IS NULL) — never every scope at once.
    const scoped = projectId ? base().eq("project_id", projectId) : base().is("project_id", null);

    const { error } = await scoped;
    if (error) {
      // Migration 100 not applied yet → no project_id column. Fall back to the
      // legacy behaviour (single org-wide link) rather than failing.
      console.warn("[site-reports/share] Scoped revoke failed:", error.message);
      const { error: legacyError } = await base();
      if (legacyError) {
        console.error("[site-reports/share] DELETE error:", legacyError.message);
        return NextResponse.json({ error: "Failed to revoke share link" }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[site-reports/share] DELETE error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
