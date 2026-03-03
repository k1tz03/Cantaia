// ============================================================
// Cantaia — Supplier Stats Updater
// Recalculates supplier scores after new offers are received
// ============================================================

import { calculateSupplierScore } from "./supplier-service";

/**
 * Update a supplier's statistics after a new offer is received.
 * Called after importing a supplier_offer.
 */
export async function updateSupplierStatsAfterOffer(
  supabase: any,
  supplierId: string,
  organizationId: string
): Promise<void> {
  try {
    // 1. Count price_requests sent to this supplier
    const { count: requestsCount } = await supabase
      .from("price_requests")
      .select("id", { count: "exact", head: true })
      .eq("supplier_id", supplierId)
      .eq("organization_id", organizationId);

    // 2. Count supplier_offers received from this supplier
    const { count: offersCount } = await supabase
      .from("supplier_offers")
      .select("id", { count: "exact", head: true })
      .eq("supplier_id", supplierId)
      .eq("organization_id", organizationId);

    // 3. Calculate average response days
    const { data: responseTimes } = await supabase
      .from("supplier_offers")
      .select("received_at, price_requests!inner(sent_at)")
      .eq("supplier_id", supplierId)
      .eq("organization_id", organizationId)
      .not("received_at", "is", null);

    let avgResponseDays = 0;
    if (responseTimes && responseTimes.length > 0) {
      const days = responseTimes
        .filter((r: any) => r.price_requests?.sent_at && r.received_at)
        .map((r: any) => {
          const sent = new Date(r.price_requests.sent_at).getTime();
          const received = new Date(r.received_at).getTime();
          return (received - sent) / (1000 * 60 * 60 * 24);
        })
        .filter((d: number) => d > 0 && d < 365);

      if (days.length > 0) {
        avgResponseDays = Math.round(days.reduce((a: number, b: number) => a + b, 0) / days.length);
      }
    }

    // 4. Calculate price competitiveness
    const { data: lineItems } = await supabase
      .from("offer_line_items")
      .select("vs_average_percent")
      .eq("supplier_id", supplierId)
      .eq("organization_id", organizationId)
      .not("vs_average_percent", "is", null);

    let priceCompetitiveness = 50; // neutral default
    if (lineItems && lineItems.length > 0) {
      const avgVsAvg = lineItems.reduce(
        (acc: number, li: any) => acc + (li.vs_average_percent || 0),
        0
      ) / lineItems.length;
      // Convert: -20% vs average = good competitiveness (80), +20% = poor (20)
      priceCompetitiveness = Math.max(0, Math.min(100, 50 - avgVsAvg));
    }

    // 5. Response rate
    const totalRequests = requestsCount || 0;
    const totalOffers = offersCount || 0;
    const responseRate = totalRequests > 0 ? Math.round((totalOffers / totalRequests) * 100) : 0;

    // 6. Get current manual_rating and reliability_score
    const { data: currentSupplier } = await supabase
      .from("suppliers")
      .select("manual_rating, reliability_score")
      .eq("id", supplierId)
      .maybeSingle();

    // 7. Calculate new overall score
    const overallScore = calculateSupplierScore({
      total_requests_sent: totalRequests,
      total_offers_received: totalOffers,
      avg_response_days: avgResponseDays,
      price_competitiveness: priceCompetitiveness,
      reliability_score: currentSupplier?.reliability_score || 50,
      manual_rating: currentSupplier?.manual_rating || 0,
    });

    // 8. Update supplier
    await supabase
      .from("suppliers")
      .update({
        total_requests_sent: totalRequests,
        total_offers_received: totalOffers,
        response_rate: responseRate,
        avg_response_days: avgResponseDays,
        price_competitiveness: priceCompetitiveness,
        overall_score: overallScore,
      })
      .eq("id", supplierId);

    console.log(`[supplier-stats] Updated supplier ${supplierId}: score=${overallScore}, rate=${responseRate}%`);
  } catch (err) {
    console.error(`[supplier-stats] Error updating supplier ${supplierId}:`, err);
  }
}
