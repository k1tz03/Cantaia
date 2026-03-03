// ============================================================
// Cantaia — Price Comparator
// Compare prices across supplier offers for a submission.
// Group line items by description, compute stats, identify
// best/worst offers, and summarize savings potential.
// ============================================================

export interface PriceComparisonItem {
  item_description: string;
  unit: string;
  quantity: number | null;
  offers: {
    supplier_id: string;
    supplier_name: string;
    unit_price: number;
    total_price: number;
    vs_average_percent: number;
    is_lowest: boolean;
    is_highest: boolean;
  }[];
  avg_unit_price: number;
  min_unit_price: number;
  max_unit_price: number;
  price_spread_percent: number; // (max-min)/avg * 100
}

export interface PriceComparisonResult {
  submission_id: string;
  items: PriceComparisonItem[];
  summary: {
    total_items: number;
    total_offers: number;
    suppliers_compared: string[];
    best_overall_supplier?: {
      supplier_id: string;
      supplier_name: string;
      total: number;
    };
    potential_savings: number; // difference between highest and lowest total
  };
}

/**
 * Normalize item description for grouping:
 * lowercase, trim, collapse whitespace
 */
function normalizeDescription(desc: string): string {
  return desc.toLowerCase().trim().replace(/\s+/g, " ");
}

/**
 * Compare prices across all supplier offers for a submission.
 *
 * 1. Fetch all supplier_offers for this submission, joined with suppliers (for name)
 * 2. Fetch all offer_line_items for those offers
 * 3. Group line items by normalized item description
 * 4. For each group: calculate avg, min, max, spread, mark lowest/highest
 * 5. Calculate summary: total items, offers count, suppliers, best overall, savings
 */
export async function comparePrices(
  supabase: any,
  organizationId: string,
  submissionId: string
): Promise<PriceComparisonResult> {
  // 1. Fetch all supplier_offers for this submission
  const { data: offers, error: offersError } = await (supabase as any)
    .from("supplier_offers")
    .select("id, supplier_id, total_amount, suppliers(id, company_name)")
    .eq("submission_id", submissionId)
    .eq("organization_id", organizationId);

  if (offersError) {
    throw new Error(`Failed to fetch offers: ${offersError.message}`);
  }

  if (!offers || offers.length === 0) {
    return {
      submission_id: submissionId,
      items: [],
      summary: {
        total_items: 0,
        total_offers: 0,
        suppliers_compared: [],
        potential_savings: 0,
      },
    };
  }

  // Build a lookup: offer_id → { supplier_id, supplier_name }
  const offerLookup: Record<
    string,
    { supplier_id: string; supplier_name: string }
  > = {};
  for (const offer of offers) {
    offerLookup[offer.id] = {
      supplier_id: offer.supplier_id,
      supplier_name: offer.suppliers?.company_name || "Unknown",
    };
  }

  const offerIds = offers.map((o: any) => o.id);

  // 2. Fetch all offer_line_items for those offers
  const { data: lineItems, error: lineError } = await (supabase as any)
    .from("offer_line_items")
    .select(
      "id, offer_id, supplier_description, supplier_unit, supplier_quantity, unit_price, total_price"
    )
    .in("offer_id", offerIds);

  if (lineError) {
    throw new Error(`Failed to fetch line items: ${lineError.message}`);
  }

  // 3. Group line items by normalized description
  const groups: Record<
    string,
    {
      original_description: string;
      unit: string;
      quantity: number | null;
      entries: {
        supplier_id: string;
        supplier_name: string;
        unit_price: number;
        total_price: number;
      }[];
    }
  > = {};

  for (const item of lineItems || []) {
    const key = normalizeDescription(item.supplier_description || "");
    if (!key) continue;

    if (!groups[key]) {
      groups[key] = {
        original_description: item.supplier_description,
        unit: item.supplier_unit || "",
        quantity: item.supplier_quantity,
        entries: [],
      };
    }

    const offerInfo = offerLookup[item.offer_id];
    if (offerInfo) {
      groups[key].entries.push({
        supplier_id: offerInfo.supplier_id,
        supplier_name: offerInfo.supplier_name,
        unit_price: Number(item.supplier_unit_price) || 0,
        total_price: Number(item.total_price) || 0,
      });
    }
  }

  // 4. For each group: calculate stats
  const comparisonItems: PriceComparisonItem[] = [];

  for (const [, group] of Object.entries(groups)) {
    if (group.entries.length === 0) continue;

    const unitPrices = group.entries.map((e) => e.unit_price);
    const avg = unitPrices.reduce((a, b) => a + b, 0) / unitPrices.length;
    const min = Math.min(...unitPrices);
    const max = Math.max(...unitPrices);
    const spread = avg > 0 ? ((max - min) / avg) * 100 : 0;

    const offerDetails = group.entries.map((entry) => ({
      supplier_id: entry.supplier_id,
      supplier_name: entry.supplier_name,
      unit_price: entry.unit_price,
      total_price: entry.total_price,
      vs_average_percent: avg > 0 ? ((entry.unit_price - avg) / avg) * 100 : 0,
      is_lowest: entry.unit_price === min,
      is_highest: entry.unit_price === max,
    }));

    comparisonItems.push({
      item_description: group.original_description,
      unit: group.unit,
      quantity: group.quantity,
      offers: offerDetails,
      avg_unit_price: Math.round(avg * 100) / 100,
      min_unit_price: min,
      max_unit_price: max,
      price_spread_percent: Math.round(spread * 100) / 100,
    });
  }

  // 5. Calculate summary
  const supplierTotals: Record<
    string,
    { supplier_id: string; supplier_name: string; total: number }
  > = {};

  for (const offer of offers) {
    const supplierId = offer.supplier_id;
    const supplierName = offer.suppliers?.company_name || "Unknown";
    if (!supplierTotals[supplierId]) {
      supplierTotals[supplierId] = {
        supplier_id: supplierId,
        supplier_name: supplierName,
        total: 0,
      };
    }
    supplierTotals[supplierId].total += Number(offer.total_amount) || 0;
  }

  const totalsArray = Object.values(supplierTotals);
  totalsArray.sort((a, b) => a.total - b.total);

  const bestOverall = totalsArray.length > 0 ? totalsArray[0] : undefined;
  const worstTotal =
    totalsArray.length > 0 ? totalsArray[totalsArray.length - 1].total : 0;
  const bestTotal = totalsArray.length > 0 ? totalsArray[0].total : 0;

  const suppliersCompared: string[] = Array.from(
    new Set(offers.map((o: any) => o.supplier_id as string))
  );

  return {
    submission_id: submissionId,
    items: comparisonItems,
    summary: {
      total_items: comparisonItems.length,
      total_offers: offers.length,
      suppliers_compared: suppliersCompared,
      best_overall_supplier: bestOverall,
      potential_savings: Math.round((worstTotal - bestTotal) * 100) / 100,
    },
  };
}
