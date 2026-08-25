import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/suppliers/:id
 * Get a single supplier by ID, verify organization ownership.
 * Also returns stats: count of price_requests and supplier_offers.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminClient = createAdminClient();

  const { data: userOrg } = await adminClient
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!userOrg?.organization_id) {
    return NextResponse.json({ error: "No organization" }, { status: 403 });
  }

  // Fetch the supplier, scoped to the user's organization
  const { data: supplier, error } = await (adminClient as any)
    .from("suppliers")
    .select("*")
    .eq("id", id)
    .eq("organization_id", userOrg.organization_id)
    .maybeSingle();

  if (error) {
    console.error("[suppliers/:id] Query error:", error);
    return NextResponse.json(
      { error: "Failed to fetch supplier" },
      { status: 500 }
    );
  }

  if (!supplier) {
    return NextResponse.json({ error: "Supplier not found" }, { status: 404 });
  }

  // Fetch stats: count of price_requests for this supplier
  const { count: requestsCount } = await (adminClient as any)
    .from("price_requests")
    .select("id", { count: "exact", head: true })
    .eq("supplier_id", id);

  // Fetch stats: count of supplier_offers for this supplier
  const { count: offersCount } = await (adminClient as any)
    .from("supplier_offers")
    .select("id", { count: "exact", head: true })
    .eq("supplier_id", id);

  return NextResponse.json({
    supplier,
    stats: {
      requests_count: requestsCount ?? 0,
      offers_count: offersCount ?? 0,
    },
  });
}

/**
 * PATCH /api/suppliers/:id
 * Update supplier fields (partial update).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminClient = createAdminClient();

  const { data: userOrg } = await adminClient
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!userOrg?.organization_id) {
    return NextResponse.json({ error: "No organization" }, { status: 403 });
  }

  const body = await request.json();

  // Only allow specific fields to be updated.
  // overall_score is intentionally NOT here: it is a computed column and the only
  // legitimate writer is recalculateAndPersistScore. Letting members set it lets
  // them forge an arbitrary score until the next recalculation.
  const allowedFields = [
    "company_name",
    "contact_name",
    "email",
    "phone",
    "address",
    "city",
    "postal_code",
    "country",
    "website",
    "specialties",
    "cfc_codes",
    "geo_zone",
    "languages",
    "certifications",
    "status",
    "supplier_type",
    "manual_rating",
    "notes",
  ];

  const SUPPLIER_TYPES = ["fournisseur", "prestataire"];
  const SUPPLIER_STATUSES = ["new", "active", "preferred", "blacklisted", "inactive"];

  const updates: Record<string, unknown> = {};
  for (const key of allowedFields) {
    if (body[key] !== undefined) {
      updates[key] = body[key];
    }
  }

  // Validate constrained fields
  if (updates.supplier_type !== undefined && !SUPPLIER_TYPES.includes(updates.supplier_type as string)) {
    return NextResponse.json({ error: "supplier_type invalide" }, { status: 400 });
  }
  if (updates.status !== undefined && !SUPPLIER_STATUSES.includes(updates.status as string)) {
    return NextResponse.json({ error: "status invalide" }, { status: 400 });
  }
  if (updates.manual_rating !== undefined) {
    const r = Number(updates.manual_rating);
    if (!Number.isFinite(r) || r < 0 || r > 5) {
      return NextResponse.json({ error: "manual_rating doit être entre 0 et 5" }, { status: 400 });
    }
    updates.manual_rating = r;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "No valid fields to update" },
      { status: 400 }
    );
  }

  const { data: supplier, error } = await (adminClient as any)
    .from("suppliers")
    .update(updates)
    .eq("id", id)
    .eq("organization_id", userOrg.organization_id)
    .select("*")
    .single();

  if (error) {
    console.error("[suppliers/:id] Update error:", error);
    return NextResponse.json(
      { error: "Failed to update supplier" },
      { status: 500 }
    );
  }

  return NextResponse.json({ supplier });
}

/**
 * DELETE /api/suppliers/:id
 * Soft delete: set supplier status to 'inactive'.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminClient = createAdminClient();

  const { data: userOrg } = await adminClient
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!userOrg?.organization_id) {
    return NextResponse.json({ error: "No organization" }, { status: 403 });
  }

  const { error } = await (adminClient as any)
    .from("suppliers")
    .update({ status: "inactive" })
    .eq("id", id)
    .eq("organization_id", userOrg.organization_id);

  if (error) {
    console.error("[suppliers/:id] Soft delete error:", error);
    return NextResponse.json(
      { error: "Failed to deactivate supplier" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
