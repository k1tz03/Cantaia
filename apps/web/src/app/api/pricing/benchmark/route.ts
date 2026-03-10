import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/pricing/benchmark?project_id=xxx
 * Returns offer_line_items + ingested_offer_lines grouped by description with benchmark stats.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const adminClient = createAdminClient();

  const { data: userOrg } = await adminClient
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!userOrg?.organization_id) {
    return NextResponse.json({ error: "No organization" }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("project_id");

  try {
    // ═══ Source 1: offer_line_items ═══
    let query1 = (adminClient as any)
      .from("offer_line_items")
      .select(`
        id, supplier_id, project_id, unit_price, total_price, currency,
        supplier_description, supplier_quantity, supplier_unit,
        normalized_description, cfc_subcode, unit_normalized,
        created_at, offer_id
      `)
      .eq("organization_id", userOrg.organization_id)
      .order("created_at", { ascending: false })
      .limit(2000);

    if (projectId) {
      query1 = query1.eq("project_id", projectId);
    }

    // ═══ Source 2: ingested_offer_lines ═══
    let query2 = (adminClient as any)
      .from("ingested_offer_lines")
      .select(`
        id, description, cfc_code, unite, quantite,
        prix_unitaire_ht, prix_total_ht,
        fournisseur_nom, date_offre, created_at
      `)
      .eq("org_id", userOrg.organization_id)
      .gt("prix_unitaire_ht", 0)
      .order("created_at", { ascending: false })
      .limit(5000);

    const [res1, res2] = await Promise.all([query1, query2]);

    if (res1.error) {
      console.error("[benchmark] offer_line_items error:", res1.error);
      return NextResponse.json({ error: res1.error.message }, { status: 500 });
    }
    if (res2.error) {
      console.error("[benchmark] ingested_offer_lines error:", res2.error);
      // Non-blocking: continue with source 1 only
    }

    const oliItems: any[] = res1.data || [];
    const ingestedItems: any[] = res2.data || [];

    if (oliItems.length === 0 && ingestedItems.length === 0) {
      return NextResponse.json({ items: [], summary: { total_items: 0, total_data_points: 0, total_suppliers: 0, total_cfc_categories: 0, avg_spread_percent: 0 } });
    }

    // ═══ Fetch suppliers and offers for offer_line_items lookup ═══
    const supplierIds = [...new Set(oliItems.map((li: any) => li.supplier_id).filter(Boolean))];
    const offerIds = [...new Set(oliItems.map((li: any) => li.offer_id).filter(Boolean))];

    const [suppliersRes, offersRes] = await Promise.all([
      supplierIds.length > 0
        ? (adminClient as any).from("suppliers").select("id, company_name").in("id", supplierIds)
        : { data: [] },
      offerIds.length > 0
        ? (adminClient as any).from("supplier_offers").select("id, received_at, project_id").in("id", offerIds)
        : { data: [] },
    ]);

    const supplierMap: Record<string, string> = {};
    for (const s of suppliersRes.data || []) {
      supplierMap[s.id] = s.company_name;
    }

    const offerMap: Record<string, any> = {};
    for (const o of offersRes.data || []) {
      offerMap[o.id] = o;
    }

    // Fetch project names if needed
    const projectIds = [...new Set(oliItems.map((li: any) => li.project_id).filter(Boolean))];
    let projectMap: Record<string, string> = {};
    if (projectIds.length > 0) {
      const { data: projects } = await (adminClient as any)
        .from("projects")
        .select("id, name")
        .in("id", projectIds);
      for (const p of projects || []) {
        projectMap[p.id] = p.name;
      }
    }

    // ═══ Unified grouping ═══
    const groups: Record<string, {
      display_description: string;
      cfc_subcode: string | null;
      unit_normalized: string;
      prices: number[];
      entries: {
        supplier_id: string | null;
        supplier_name: string;
        unit_price: number;
        total_price: number | null;
        quantity: number | null;
        project_name: string | null;
        project_id: string | null;
        received_at: string | null;
      }[];
    }> = {};

    // Source 1: offer_line_items
    for (const li of oliItems) {
      const key = (li.normalized_description || li.supplier_description || "").toLowerCase().trim();
      if (!key) continue;

      if (!groups[key]) {
        groups[key] = {
          display_description: li.supplier_description || li.normalized_description || "",
          cfc_subcode: li.cfc_subcode,
          unit_normalized: li.unit_normalized || li.supplier_unit || "",
          prices: [],
          entries: [],
        };
      }

      if (!groups[key].cfc_subcode && li.cfc_subcode) {
        groups[key].cfc_subcode = li.cfc_subcode;
      }

      const price = Number(li.unit_price);
      if (price > 0) {
        groups[key].prices.push(price);
      }

      const offer = li.offer_id ? offerMap[li.offer_id] : null;
      const projName = li.project_id ? projectMap[li.project_id] : null;

      groups[key].entries.push({
        supplier_id: li.supplier_id,
        supplier_name: supplierMap[li.supplier_id] || "Inconnu",
        unit_price: price,
        total_price: li.total_price,
        quantity: li.supplier_quantity,
        project_name: projName,
        project_id: li.project_id,
        received_at: offer?.received_at || li.created_at,
      });
    }

    // Source 2: ingested_offer_lines
    for (const li of ingestedItems) {
      const key = (li.description || "").toLowerCase().trim();
      if (!key) continue;

      if (!groups[key]) {
        groups[key] = {
          display_description: li.description || "",
          cfc_subcode: li.cfc_code || null,
          unit_normalized: li.unite || "",
          prices: [],
          entries: [],
        };
      }

      if (!groups[key].cfc_subcode && li.cfc_code) {
        groups[key].cfc_subcode = li.cfc_code;
      }

      const price = Number(li.prix_unitaire_ht);
      if (price > 0) {
        groups[key].prices.push(price);
      }

      groups[key].entries.push({
        supplier_id: null,
        supplier_name: li.fournisseur_nom || "Inconnu",
        unit_price: price,
        total_price: li.prix_total_ht ? Number(li.prix_total_ht) : null,
        quantity: li.quantite ? Number(li.quantite) : null,
        project_name: null,
        project_id: null,
        received_at: li.date_offre || li.created_at,
      });
    }

    // ═══ Compute stats per group ═══
    const items = Object.entries(groups).map(([key, group]) => {
      const prices = group.prices.sort((a, b) => a - b);
      const n = prices.length;
      const min = n > 0 ? prices[0] : 0;
      const max = n > 0 ? prices[n - 1] : 0;
      const avg = n > 0 ? prices.reduce((s, p) => s + p, 0) / n : 0;
      const median = n > 0 ? (n % 2 === 0 ? (prices[n / 2 - 1] + prices[n / 2]) / 2 : prices[Math.floor(n / 2)]) : 0;
      const spread = avg > 0 ? ((max - min) / avg) * 100 : 0;

      return {
        normalized_key: key,
        display_description: group.display_description,
        cfc_subcode: group.cfc_subcode,
        unit_normalized: group.unit_normalized,
        min_unit_price: min,
        max_unit_price: max,
        avg_unit_price: Math.round(avg * 100) / 100,
        median_unit_price: Math.round(median * 100) / 100,
        data_points: n,
        price_spread_percent: Math.round(spread * 10) / 10,
        suppliers: group.entries,
      };
    }).sort((a, b) => b.data_points - a.data_points);

    // ═══ Summary stats from combined sources ═══
    const totalDataPoints = items.reduce((s, i) => s + i.data_points, 0);
    const allSupplierNames = new Set<string>();
    for (const item of items) {
      for (const e of item.suppliers) {
        if (e.supplier_name && e.supplier_name !== "Inconnu") {
          allSupplierNames.add(e.supplier_name.toLowerCase());
        }
      }
    }
    const totalCfcCategories = new Set(items.map((i) => i.cfc_subcode?.split(".")[0]).filter(Boolean)).size;
    const avgSpread = items.length > 0
      ? Math.round(items.reduce((s, i) => s + i.price_spread_percent, 0) / items.length * 10) / 10
      : 0;

    return NextResponse.json({
      items,
      summary: {
        total_items: items.length,
        total_data_points: totalDataPoints,
        total_suppliers: allSupplierNames.size,
        total_cfc_categories: totalCfcCategories,
        avg_spread_percent: avgSpread,
      },
    });
  } catch (err: unknown) {
    console.error("[benchmark] Error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
