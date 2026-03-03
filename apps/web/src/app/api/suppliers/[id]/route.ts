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

  // Only allow specific fields to be updated
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
    "manual_rating",
    "notes",
    "overall_score",
  ];

  const updates: Record<string, any> = {};
  for (const key of allowedFields) {
    if (body[key] !== undefined) {
      updates[key] = body[key];
    }
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
