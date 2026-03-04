import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/benchmarks/normalization?search=xxx
 * Returns normalization rules for matching descriptions to canonical CFC codes.
 * Used by the pricing extraction pipeline and the benchmark UI.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search");

  try {
    let query = (admin as any)
      .from("normalization_rules")
      .select("id, canonical_description, cfc_code, standard_unit, raw_patterns, confidence")
      .order("cfc_code", { ascending: true });

    if (search) {
      query = query.ilike("canonical_description", `%${search}%`);
    }

    const { data: rules, error } = await query.limit(200);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ rules: rules || [] });
  } catch (err: any) {
    console.error("[benchmarks/normalization] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
