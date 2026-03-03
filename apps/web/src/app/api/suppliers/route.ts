import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/suppliers
 * List suppliers for the authenticated user's organization.
 * Query params: search, specialty, geo_zone, status, cfc_code
 * Order by: overall_score DESC, company_name ASC
 */
export async function GET(request: NextRequest) {
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

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search");
  const specialty = searchParams.get("specialty");
  const geoZone = searchParams.get("geo_zone");
  const status = searchParams.get("status");
  const cfcCode = searchParams.get("cfc_code");

  let query = (adminClient as any)
    .from("suppliers")
    .select("*")
    .eq("organization_id", userOrg.organization_id);

  // Full-text search across multiple fields
  if (search) {
    query = query.or(
      `company_name.ilike.%${search}%,contact_name.ilike.%${search}%,email.ilike.%${search}%,city.ilike.%${search}%`
    );
  }

  // Filter by specialty (contained in the specialties JSONB/array column)
  if (specialty) {
    query = query.contains("specialties", [specialty]);
  }

  // Filter by geographic zone
  if (geoZone) {
    query = query.eq("geo_zone", geoZone);
  }

  // Filter by status
  if (status) {
    query = query.eq("status", status);
  }

  // Filter by CFC code (contained in cfc_codes array)
  if (cfcCode) {
    query = query.contains("cfc_codes", [cfcCode]);
  }

  // Order by overall_score DESC, then company_name ASC
  query = query
    .order("overall_score", { ascending: false, nullsFirst: false })
    .order("company_name", { ascending: true });

  const { data: suppliers, error } = await query;

  if (error) {
    console.error("[suppliers] Query error:", error);
    return NextResponse.json(
      { error: "Failed to fetch suppliers" },
      { status: 500 }
    );
  }

  return NextResponse.json({ suppliers: suppliers || [] });
}

/**
 * POST /api/suppliers
 * Create a new supplier for the authenticated user's organization.
 */
export async function POST(request: NextRequest) {
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

  // Validate required fields
  if (!body.company_name || typeof body.company_name !== "string" || body.company_name.trim() === "") {
    return NextResponse.json(
      { error: "company_name is required" },
      { status: 400 }
    );
  }

  // Build insert payload with allowed fields
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
  ];

  const insertData: Record<string, any> = {
    organization_id: userOrg.organization_id,
    created_by: user.id,
  };

  for (const key of allowedFields) {
    if (body[key] !== undefined) {
      insertData[key] = body[key];
    }
  }

  const { data: supplier, error } = await (adminClient as any)
    .from("suppliers")
    .insert(insertData)
    .select("*")
    .single();

  if (error) {
    console.error("[suppliers] Insert error:", error);
    return NextResponse.json(
      { error: "Failed to create supplier" },
      { status: 500 }
    );
  }

  return NextResponse.json({ supplier }, { status: 201 });
}
