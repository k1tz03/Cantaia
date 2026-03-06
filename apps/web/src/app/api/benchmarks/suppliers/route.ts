import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/benchmarks/suppliers?specialty=xxx&region=xxx
 * Returns aggregated supplier market scores (C2 data).
 * Only accessible to organizations that have opted in to 'fournisseurs' sharing.
 */
export async function GET(request: Request) {
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

  // Check consent
  const { data: consent } = await (admin as any)
    .from("aggregation_consent")
    .select("opted_in")
    .eq("organization_id", userOrg.organization_id)
    .eq("module", "fournisseurs")
    .maybeSingle();

  if (!consent?.opted_in) {
    return NextResponse.json(
      {
        error: "Accès réservé aux contributeurs. Activez le partage des données Fournisseurs dans Paramètres > Partage de données.",
        requires_consent: true,
      },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);
  const specialty = searchParams.get("specialty");
  const region = searchParams.get("region");

  try {
    let query = (admin as any)
      .from("supplier_market_scores")
      .select("*")
      .order("avg_score", { ascending: false });

    if (specialty) query = query.eq("specialty", specialty);
    if (region) query = query.eq("region", region);

    const { data: scores, error } = await query.limit(200);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ scores: scores || [] });
  } catch (err: unknown) {
    console.error("[benchmarks/suppliers] Error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Internal error" }, { status: 500 });
  }
}
