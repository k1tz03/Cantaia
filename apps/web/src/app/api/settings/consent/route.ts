import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const MODULES = [
  "prix",
  "fournisseurs",
  "plans",
  "pv",
  "visites",
  "chat",
  "mail",
  "taches",
  "briefing",
] as const;

/**
 * GET /api/settings/consent
 * Returns consent status for all modules for the current organization.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  const { data: userOrg } = await admin
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!userOrg?.organization_id) {
    return NextResponse.json({ error: "No organization" }, { status: 400 });
  }

  const { data: consents } = await (admin as any)
    .from("aggregation_consent")
    .select("module, opted_in, updated_at")
    .eq("organization_id", userOrg.organization_id);

  // Build a complete map with all modules (default: opted_in = false)
  const consentMap: Record<string, { opted_in: boolean; updated_at: string | null }> = {};
  for (const mod of MODULES) {
    consentMap[mod] = { opted_in: false, updated_at: null };
  }
  for (const c of consents || []) {
    consentMap[c.module] = { opted_in: c.opted_in, updated_at: c.updated_at };
  }

  return NextResponse.json({ consents: consentMap });
}

/**
 * POST /api/settings/consent
 * Update consent for one or more modules.
 * Body: { modules: { prix: true, fournisseurs: false, ... } }
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  const { data: userOrg } = await admin
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!userOrg?.organization_id) {
    return NextResponse.json({ error: "No organization" }, { status: 400 });
  }

  const body = await request.json();
  const modules: Record<string, boolean> = body.modules || {};

  const results: { module: string; opted_in: boolean; error?: string }[] = [];

  for (const [mod, optedIn] of Object.entries(modules)) {
    if (!MODULES.includes(mod as any)) {
      results.push({ module: mod, opted_in: false, error: "Unknown module" });
      continue;
    }

    const { error } = await (admin as any)
      .from("aggregation_consent")
      .upsert(
        {
          organization_id: userOrg.organization_id,
          module: mod,
          opted_in: optedIn,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "organization_id,module" }
      );

    results.push({
      module: mod,
      opted_in: optedIn,
      error: error?.message,
    });
  }

  return NextResponse.json({ success: true, results });
}
