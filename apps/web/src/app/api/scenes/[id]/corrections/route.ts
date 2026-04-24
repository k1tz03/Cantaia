import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseBody } from "@/lib/api/parse-body";

/**
 * POST /api/scenes/:id/corrections
 *
 * Append-only log of user corrections on a BuildingScene element
 * (ADR-001 W1-W3).
 *
 * Data model (migration 076 → `plan_scene_corrections`):
 *   - Append-only. The UI renders the latest correction per
 *     (scene_id, element_id) — we never UPDATE or DELETE rows here.
 *   - `element_id` is plain TEXT (not an FK) because elements live
 *     inside `plan_scenes.scene_data` JSONB. Referential integrity is
 *     enforced at this API layer: we could fetch the scene and assert
 *     the element_id exists, but that doubles the read latency and the
 *     cost of a stale reference (a correction pointing at a vanished
 *     element) is just a noop in the UI. We accept it.
 *   - `correction_type` is a CHECK-constrained enum. We validate it
 *     client-side via Zod so callers get a friendly 400 instead of a
 *     23514 (check_violation) 500 from PostgREST.
 *
 * Security:
 *   - Auth (Supabase SSR).
 *   - Org scope is enforced via a direct check on
 *     `plan_scenes.organization_id`. We do NOT join through
 *     `plan_registry` — the scene IS the target of the correction and
 *     `plan_scene_corrections.organization_id` mirrors it for RLS and
 *     for cross-tenant queries. A scene in another org → 403 `Forbidden`
 *     (deliberate: we DO leak that the id exists, because 404 would
 *     require the same org-scoped lookup we just did; returning 403
 *     keeps the semantic distinction between "no such scene" and
 *     "someone else's scene").
 *
 * The `original_value` field is nullable by design: for
 * correction_type='add' there's no prior snapshot. For all other types
 * we recommend (but do not require) that the caller sends the prior
 * element payload — it makes the corrections log self-describing for
 * later audit and learning.
 */

// Enum values MUST match the CHECK constraint in migration 076. If you
// add a new correction_type to the migration, mirror it here or
// PostgREST will 23514 on INSERT.
const CORRECTION_TYPES = [
  "geometry",
  "material",
  "opening_type",
  "level_assignment",
  "delete",
  "add",
] as const;

const bodySchema = z.object({
  element_id: z.string().trim().min(1).max(256),
  correction_type: z.enum(CORRECTION_TYPES),
  // `.unknown()` accepts any valid JSON value (object, array, string,
  // number, boolean) — JSONB columns are type-agnostic and we don't
  // want to force callers into a specific element-shape at this layer.
  original_value: z.unknown().nullable().optional(),
  corrected_value: z.unknown(),
  notes: z.string().trim().max(2000).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sceneId } = await params;

  // 1. Auth
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // 2. Org resolution
  const { data: userOrg } = await admin
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!userOrg?.organization_id) {
    return NextResponse.json({ error: "No organization" }, { status: 403 });
  }

  // 3. Parse + validate body
  const { data: raw, error: parseErr } = await parseBody(request);
  if (parseErr || !raw) {
    return NextResponse.json({ error: parseErr ?? "Invalid body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid request body",
        // `flatten()` gives per-field errors — useful for UI forms.
        details: parsed.error.flatten(),
      },
      { status: 400 }
    );
  }

  const { element_id, correction_type, original_value, corrected_value, notes } =
    parsed.data;

  // 4. Anti-IDOR: verify the scene belongs to the caller's org.
  //
  //   Why not rely on the RLS policy on plan_scene_corrections alone?
  //   Because we're using the admin client (service role) which bypasses
  //   RLS. The server is the security boundary here. Always check.
  const { data: scene, error: sceneErr } = await (admin as any)
    .from("plan_scenes")
    .select("id, organization_id, extraction_status")
    .eq("id", sceneId)
    .maybeSingle();

  if (sceneErr) {
    console.error("[scenes/:id/corrections] scene lookup error:", sceneErr);
    return NextResponse.json({ error: "Failed to fetch scene" }, { status: 500 });
  }

  if (!scene) {
    return NextResponse.json({ error: "Scene not found" }, { status: 404 });
  }

  if (scene.organization_id !== userOrg.organization_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Guard: don't accept corrections on scenes that are still processing
  // or that failed outright. Corrections on an incomplete scene would
  // be semantically nonsensical — there's no element_id to point at.
  if (scene.extraction_status !== "completed") {
    return NextResponse.json(
      {
        error: "Scene not ready for corrections",
        extraction_status: scene.extraction_status,
      },
      { status: 409 }
    );
  }

  // 5. Insert the append-only correction row.
  //
  // `original_value` is nullable in the schema. Zod lets callers omit
  // it entirely OR send `null`; we normalise both to `null` so the
  // column stores a consistent JSONB null rather than a missing key.
  const { data: inserted, error: insertErr } = await (admin as any)
    .from("plan_scene_corrections")
    .insert({
      scene_id: sceneId,
      organization_id: userOrg.organization_id,
      element_id,
      correction_type,
      original_value: original_value ?? null,
      corrected_value,
      notes: notes ?? null,
      corrected_by: user.id,
    })
    .select("id, created_at")
    .single();

  if (insertErr || !inserted) {
    console.error(
      "[scenes/:id/corrections] insert error:",
      insertErr?.message ?? "unknown"
    );
    return NextResponse.json(
      { error: "Failed to save correction" },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      correction_id: inserted.id,
      scene_id: sceneId,
      element_id,
      correction_type,
      created_at: inserted.created_at,
    },
    { status: 201 }
  );
}
