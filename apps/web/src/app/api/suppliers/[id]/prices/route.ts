import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/suppliers/:id/prices
 * Returns all offers and line items for a specific supplier.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: supplierId } = await params;

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

  try {
    // Fetch offers for this supplier
    const { data: offers, error: offersError } = await (adminClient as any)
      .from("supplier_offers")
      .select("id, total_amount, currency, received_at, status, source_type, project_id")
      .eq("supplier_id", supplierId)
      .eq("organization_id", userOrg.organization_id)
      .order("received_at", { ascending: false });

    if (offersError) {
      return NextResponse.json({ error: offersError.message }, { status: 500 });
    }

    if (!offers || offers.length === 0) {
      return NextResponse.json({ offers: [] });
    }

    // Fetch line items for all offers
    const offerIds = offers.map((o: any) => o.id);
    const { data: lineItems } = await (adminClient as any)
      .from("offer_line_items")
      .select("id, offer_id, supplier_description, unit_price, total_price, supplier_quantity, supplier_unit, cfc_subcode, unit_normalized, normalized_description")
      .in("offer_id", offerIds)
      .order("created_at", { ascending: true });

    // Fetch project names
    const projectIds = [...new Set(offers.map((o: any) => o.project_id).filter(Boolean))];
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

    // Group line items by offer
    const lineItemsByOffer: Record<string, any[]> = {};
    for (const li of lineItems || []) {
      if (!lineItemsByOffer[li.offer_id]) lineItemsByOffer[li.offer_id] = [];
      lineItemsByOffer[li.offer_id].push(li);
    }

    // Combine
    const result = offers.map((offer: any) => ({
      ...offer,
      project_name: offer.project_id ? projectMap[offer.project_id] : null,
      line_items: lineItemsByOffer[offer.id] || [],
    }));

    return NextResponse.json({ offers: result });
  } catch (err: any) {
    console.error("[supplier-prices] Error:", err);
    return NextResponse.json({ error: err.message || "Failed" }, { status: 500 });
  }
}
