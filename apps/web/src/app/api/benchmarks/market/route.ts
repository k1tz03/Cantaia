import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/benchmarks/market?cfc_code=xxx&region=xxx&quarter=xxx
 * Returns aggregated market benchmarks (C2 data).
 * Only accessible to organizations that have opted in to 'prix' sharing.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  // Get user's org
  const { data: userOrg } = await admin
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!userOrg?.organization_id) {
    return NextResponse.json({ error: "No organization" }, { status: 400 });
  }

  // Check if org is opted in to 'prix' module
  const { data: consent } = await (admin as any)
    .from("aggregation_consent")
    .select("opted_in")
    .eq("organization_id", userOrg.organization_id)
    .eq("module", "prix")
    .maybeSingle();

  if (!consent?.opted_in) {
    return NextResponse.json(
      {
        error: "Accès réservé aux contributeurs. Activez le partage des données Prix dans Paramètres > Partage de données.",
        requires_consent: true,
      },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);
  const cfcCode = searchParams.get("cfc_code");
  const region = searchParams.get("region");
  const quarter = searchParams.get("quarter");

  try {
    let query = (admin as any)
      .from("market_benchmarks")
      .select("*")
      .order("cfc_code", { ascending: true });

    if (cfcCode) query = query.eq("cfc_code", cfcCode);
    if (region) query = query.eq("region", region);
    if (quarter) query = query.eq("quarter", quarter);

    const { data: benchmarks, error } = await query.limit(500);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Also fetch regional index if available
    let regionalIndex = null;
    if (region && quarter) {
      const { data } = await (admin as any)
        .from("regional_price_index")
        .select("*")
        .eq("region", region)
        .eq("quarter", quarter)
        .maybeSingle();
      regionalIndex = data;
    }

    return NextResponse.json({
      benchmarks: benchmarks || [],
      regional_index: regionalIndex,
    });
  } catch (err: unknown) {
    console.error("[benchmarks/market] Error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Internal error" }, { status: 500 });
  }
}
