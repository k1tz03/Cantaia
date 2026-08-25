import { createAdminClient } from "@/lib/supabase/admin";
import { verifyPortalToken } from "@/lib/portal/auth";

/**
 * Public-ish project fields every portal route may safely surface to a
 * PIN-authenticated (or, for name/code only, an unauthenticated) device.
 * Deliberately no financials, no PIN hash, no internal ids beyond the project.
 */
export interface PortalProject {
  id: string;
  organizationId: string | null;
  name: string | null;
  code: string | null;
  address: string | null;
  city: string | null;
  status: string | null;
  /** projects.portal_description */
  description: string | null;
  /** projects.portal_submission_id */
  submissionId: string | null;
  /** projects.client_name (maître d'ouvrage) */
  clientName: string | null;
}

/**
 * Gate for EVERY portal API route.
 *
 * The project must exist, have the portal enabled, and the request must carry a
 * valid session cookie for THAT project (the cookie name is project-scoped, so
 * a PIN for site A never opens site B).
 *
 * Returns the admin client so callers do not open a second one, the
 * organization id so a route can scope org-wide data (suppliers) without a
 * second round-trip, and the curated `project` fields so a route (e.g. /info)
 * never re-fetches the same row.
 *
 * `project` is also returned when the token is INVALID (as long as the project
 * exists and the portal is enabled), so the PIN screen can show the site name
 * behind a 401 without a second endpoint. It is omitted only when the project
 * is missing or the portal is disabled — those callers must 404.
 *
 * Kept out of lib/portal/auth.ts on purpose: that module is the crypto surface
 * (PIN hashing, JWT signing) and is shared with the app side.
 */
export async function requirePortalSession(projectId: string): Promise<{
  valid: boolean;
  userName?: string;
  organizationId?: string;
  project?: PortalProject;
  admin: ReturnType<typeof createAdminClient>;
}> {
  const admin = createAdminClient();

  const { data: project } = await (admin as any)
    .from("projects")
    .select(
      "id, organization_id, name, code, address, city, status, client_name, portal_description, portal_submission_id, portal_pin_salt, portal_enabled",
    )
    .eq("id", projectId)
    .single();

  if (!project || !project.portal_enabled) return { valid: false, admin };

  const pub: PortalProject = {
    id: project.id,
    organizationId: project.organization_id ?? null,
    name: project.name ?? null,
    code: project.code ?? null,
    address: project.address ?? null,
    city: project.city ?? null,
    status: project.status ?? null,
    description: project.portal_description ?? null,
    submissionId: project.portal_submission_id ?? null,
    clientName: project.client_name ?? null,
  };

  const auth = await verifyPortalToken(projectId, project.portal_pin_salt || "");
  if (!auth.valid) return { valid: false, project: pub, admin };

  return {
    valid: true,
    userName: auth.userName,
    organizationId: project.organization_id ?? undefined,
    project: pub,
    admin,
  };
}
