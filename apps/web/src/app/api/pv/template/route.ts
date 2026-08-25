// ============================================================
// GET / PUT /api/pv/template — the organization's PV outline (Agent O)
// ============================================================
// Every firm has its own séance outline ("Tour de table, Avancement, Sécurité,
// Divers…"). Forcing Cantaia's outline on all of them made the generated PV
// unusable without reordering it by hand every time.
//
// Stored in `organizations.pv_template` (migration 095). NULL means "use the
// built-in outline", which is also what a reset writes back.
//
// Deliberately NOT under /settings: Settings is another agent's surface, and
// this is edited from the PV screen where the user actually feels the need.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseBody } from "@/lib/api/parse-body";
import { ORG_ADMIN_ROLES } from "@/lib/admin/require-org-admin";
import {
  DEFAULT_PV_TEMPLATE,
  loadPVTemplate,
  parsePVTemplate,
  type PVTemplateSection,
} from "../_shared/pv-circulation";

/** PostgREST codes meaning "that column does not exist (yet)". */
function isMissingColumn(error: any): boolean {
  if (!error) return false;
  if (String(error.code) === "42703" || String(error.code) === "PGRST204") return true;
  const message = String(error.message || "").toLowerCase();
  return message.includes("column") && message.includes("does not exist");
}

async function resolveProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" as const, status: 401 as const };

  const admin = createAdminClient();
  const { data: profile } = await (admin as any)
    .from("users")
    .select("organization_id, role, is_superadmin")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.organization_id) {
    return { error: "Forbidden" as const, status: 403 as const };
  }
  return { admin, user, profile };
}

// ------------------------------------------------------------
// GET — read the outline (any member: the editor renders from it)
// ------------------------------------------------------------

export async function GET() {
  try {
    const resolved = await resolveProfile();
    if ("error" in resolved) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    }
    const { admin, profile } = resolved;

    const { sections, isCustom } = await loadPVTemplate(admin, profile.organization_id);
    const canEdit =
      profile.is_superadmin === true ||
      (ORG_ADMIN_ROLES as readonly string[]).includes(profile.role || "") ||
      profile.role === "project_manager";

    return NextResponse.json({
      success: true,
      sections,
      is_custom: isCustom,
      can_edit: canEdit,
      default_sections: DEFAULT_PV_TEMPLATE,
    });
  } catch (error) {
    console.error("[PV Template] GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ------------------------------------------------------------
// PUT — replace the outline (org admins, directors, project managers)
// ------------------------------------------------------------

export async function PUT(request: NextRequest) {
  try {
    const resolved = await resolveProfile();
    if ("error" in resolved) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    }
    const { admin, profile } = resolved;

    // The outline drives every future PV of the org — not a member-level knob.
    const canEdit =
      profile.is_superadmin === true ||
      (ORG_ADMIN_ROLES as readonly string[]).includes(profile.role || "") ||
      profile.role === "project_manager";
    if (!canEdit) {
      return NextResponse.json(
        { error: "Seuls les administrateurs et chefs de projet peuvent modifier le modèle de PV." },
        { status: 403 }
      );
    }

    const { data: body, error: parseError } = await parseBody(request);
    if (parseError || !body) {
      return NextResponse.json({ error: parseError || "Invalid request" }, { status: 400 });
    }

    // `sections: null` / `[]` resets the org to the Cantaia outline.
    const wantsReset =
      body.reset === true || body.sections === null || (Array.isArray(body.sections) && body.sections.length === 0);

    let value: { sections: PVTemplateSection[] } | null = null;
    if (!wantsReset) {
      const parsed = parsePVTemplate({ sections: body.sections });
      if (!parsed) {
        return NextResponse.json(
          { error: "Modèle invalide : chaque section doit avoir un titre." },
          { status: 400 }
        );
      }
      value = { sections: parsed };
    }

    const { error } = await (admin as any)
      .from("organizations")
      .update({ pv_template: value })
      .eq("id", profile.organization_id);

    if (error) {
      if (isMissingColumn(error)) {
        return NextResponse.json(
          {
            error:
              "Le modèle de PV nécessite la migration 095 (organizations.pv_template), non encore appliquée.",
          },
          { status: 503 }
        );
      }
      console.error("[PV Template] PUT error:", error.message);
      return NextResponse.json({ error: "Échec de l'enregistrement du modèle." }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      sections: value?.sections ?? DEFAULT_PV_TEMPLATE,
      is_custom: value !== null,
    });
  } catch (error) {
    console.error("[PV Template] PUT error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
