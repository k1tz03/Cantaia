import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

interface ImportRow {
  company_name?: string;
  contact_name?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  postal_code?: string;
  website?: string;
  specialties?: string[];
  cfc_codes?: string[];
  geo_zone?: string;
}

/**
 * POST /api/suppliers/import
 * Import suppliers from CSV data (parsed as JSON rows).
 * Body: { rows: ImportRow[] }
 * Returns: { imported: number, skipped: number, errors: string[] }
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
  const rows: ImportRow[] = body.rows;

  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json(
      { error: "rows must be a non-empty array" },
      { status: 400 }
    );
  }

  // Fetch existing supplier names for this org to detect duplicates
  const { data: existingSuppliers } = await (adminClient as any)
    .from("suppliers")
    .select("company_name")
    .eq("organization_id", userOrg.organization_id);

  const existingNames = new Set(
    (existingSuppliers || []).map((s: any) =>
      (s.company_name as string).toLowerCase().trim()
    )
  );

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 1;

    // Validate: company_name is required
    if (
      !row.company_name ||
      typeof row.company_name !== "string" ||
      row.company_name.trim() === ""
    ) {
      errors.push(`Row ${rowNum}: company_name is missing or empty`);
      skipped++;
      continue;
    }

    const normalizedName = row.company_name.toLowerCase().trim();

    // Skip duplicates (same company_name already exists in org)
    if (existingNames.has(normalizedName)) {
      skipped++;
      continue;
    }

    // Build insert data
    const insertData: Record<string, any> = {
      organization_id: userOrg.organization_id,
      created_by: user.id,
      company_name: row.company_name.trim(),
    };

    if (row.contact_name) insertData.contact_name = row.contact_name;
    if (row.email) insertData.email = row.email;
    if (row.phone) insertData.phone = row.phone;
    if (row.address) insertData.address = row.address;
    if (row.city) insertData.city = row.city;
    if (row.postal_code) insertData.postal_code = row.postal_code;
    if (row.website) insertData.website = row.website;
    if (row.specialties) insertData.specialties = row.specialties;
    if (row.cfc_codes) insertData.cfc_codes = row.cfc_codes;
    if (row.geo_zone) insertData.geo_zone = row.geo_zone;

    const { error } = await (adminClient as any)
      .from("suppliers")
      .insert(insertData);

    if (error) {
      console.error(`[suppliers/import] Row ${rowNum} insert error:`, error);
      errors.push(`Row ${rowNum} (${row.company_name}): ${error.message}`);
      skipped++;
    } else {
      imported++;
      // Add to existing set so subsequent rows in this batch are also deduped
      existingNames.add(normalizedName);
    }
  }

  return NextResponse.json({ imported, skipped, errors });
}
