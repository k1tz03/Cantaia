// ============================================================
// Cantaia — Pricing Alert Generator
// Generate pricing alerts from comparison data:
// anomalies, high spreads, new lowest, missing responses,
// and opportunities for additional quotes.
// ============================================================

import type { PriceComparisonResult } from "./price-comparator";

export type AlertType =
  | "price_anomaly"
  | "high_spread"
  | "new_lowest"
  | "trend_increase"
  | "missing_response"
  | "opportunity";

export type AlertSeverity = "info" | "warning" | "critical";

export interface PricingAlert {
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  description: string;
  submission_id?: string;
  supplier_id?: string;
  item_description?: string;
  metadata: Record<string, any>;
}

/**
 * Generate pricing alerts from a price comparison result and save them to DB.
 *
 * Alert rules:
 * 1. price_anomaly (warning): offer with vs_average > 30% or < -30%
 * 2. high_spread (info): items with price_spread_percent > 50%
 * 3. new_lowest (info): supplier is lowest for majority of items
 * 4. missing_response (warning): price_requests sent > 7 days ago with no response
 * 5. opportunity (info): item has only 1 offer — suggest getting more quotes
 */
export async function generatePricingAlerts(
  supabase: any,
  organizationId: string,
  submissionId: string,
  comparison: PriceComparisonResult
): Promise<PricingAlert[]> {
  const alerts: PricingAlert[] = [];

  // --- Rule 1: Price anomalies (vs_average > 30% or < -30%) ---
  for (const item of comparison.items) {
    for (const offer of item.offers) {
      if (Math.abs(offer.vs_average_percent) > 30) {
        const direction =
          offer.vs_average_percent > 0 ? "above" : "below";
        const severity: AlertSeverity =
          Math.abs(offer.vs_average_percent) > 50 ? "critical" : "warning";

        alerts.push({
          type: "price_anomaly",
          severity,
          title: `Prix anormal — ${offer.supplier_name}`,
          description: `Le prix de "${item.item_description}" par ${offer.supplier_name} est ${Math.abs(Math.round(offer.vs_average_percent))}% ${direction === "above" ? "au-dessus" : "en-dessous"} de la moyenne (${offer.unit_price} CHF vs ${item.avg_unit_price} CHF moy.)`,
          submission_id: submissionId,
          supplier_id: offer.supplier_id,
          item_description: item.item_description,
          metadata: {
            unit_price: offer.unit_price,
            avg_price: item.avg_unit_price,
            deviation_percent: Math.round(offer.vs_average_percent * 100) / 100,
            direction,
          },
        });
      }
    }
  }

  // --- Rule 2: High price spread (> 50%) ---
  for (const item of comparison.items) {
    if (item.price_spread_percent > 50 && item.offers.length >= 2) {
      alerts.push({
        type: "high_spread",
        severity: "info",
        title: `Écart de prix important — ${item.item_description}`,
        description: `L'écart entre le prix le plus bas (${item.min_unit_price} CHF) et le plus haut (${item.max_unit_price} CHF) pour "${item.item_description}" est de ${Math.round(item.price_spread_percent)}%. Vérifiez les spécifications.`,
        submission_id: submissionId,
        item_description: item.item_description,
        metadata: {
          min_price: item.min_unit_price,
          max_price: item.max_unit_price,
          spread_percent: item.price_spread_percent,
          offer_count: item.offers.length,
        },
      });
    }
  }

  // --- Rule 3: New lowest — supplier is lowest for majority of items ---
  if (comparison.items.length > 0) {
    const lowestCount: Record<string, { count: number; name: string }> = {};

    for (const item of comparison.items) {
      for (const offer of item.offers) {
        if (offer.is_lowest) {
          if (!lowestCount[offer.supplier_id]) {
            lowestCount[offer.supplier_id] = {
              count: 0,
              name: offer.supplier_name,
            };
          }
          lowestCount[offer.supplier_id].count++;
        }
      }
    }

    const majorityThreshold = comparison.items.length / 2;
    for (const [supplierId, data] of Object.entries(lowestCount)) {
      if (data.count > majorityThreshold) {
        alerts.push({
          type: "new_lowest",
          severity: "info",
          title: `Meilleure offre globale — ${data.name}`,
          description: `${data.name} propose le prix le plus bas sur ${data.count}/${comparison.items.length} postes. C'est le fournisseur le plus compétitif pour cette soumission.`,
          submission_id: submissionId,
          supplier_id: supplierId,
          metadata: {
            lowest_count: data.count,
            total_items: comparison.items.length,
            percentage: Math.round(
              (data.count / comparison.items.length) * 100
            ),
          },
        });
      }
    }
  }

  // --- Rule 4: Missing responses (price_requests sent > 7 days ago) ---
  const sevenDaysAgo = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data: pendingRequests } = await (supabase as any)
    .from("price_requests")
    .select("id, supplier_id, sent_at, suppliers(company_name)")
    .eq("submission_id", submissionId)
    .eq("organization_id", organizationId)
    .eq("status", "sent")
    .lt("sent_at", sevenDaysAgo);

  if (pendingRequests && pendingRequests.length > 0) {
    for (const req of pendingRequests) {
      const supplierName = req.suppliers?.company_name || "Fournisseur inconnu";
      const daysSent = Math.floor(
        (Date.now() - new Date(req.sent_at).getTime()) / (1000 * 60 * 60 * 24)
      );

      alerts.push({
        type: "missing_response",
        severity: "warning",
        title: `Pas de réponse — ${supplierName}`,
        description: `La demande de prix envoyée à ${supplierName} il y a ${daysSent} jours n'a toujours pas reçu de réponse. Envisagez une relance.`,
        submission_id: submissionId,
        supplier_id: req.supplier_id,
        metadata: {
          price_request_id: req.id,
          sent_at: req.sent_at,
          days_waiting: daysSent,
        },
      });
    }
  }

  // --- Rule 5: Opportunity — items with only 1 offer ---
  for (const item of comparison.items) {
    if (item.offers.length === 1) {
      alerts.push({
        type: "opportunity",
        severity: "info",
        title: `Offre unique — ${item.item_description}`,
        description: `Seul ${item.offers[0].supplier_name} a soumis un prix pour "${item.item_description}". Demandez d'autres devis pour comparer.`,
        submission_id: submissionId,
        item_description: item.item_description,
        metadata: {
          single_supplier_id: item.offers[0].supplier_id,
          single_supplier_name: item.offers[0].supplier_name,
          unit_price: item.offers[0].unit_price,
        },
      });
    }
  }

  // --- Save alerts to pricing_alerts table ---
  if (alerts.length > 0) {
    const rows = alerts.map((alert) => ({
      organization_id: organizationId,
      submission_id: alert.submission_id || submissionId,
      supplier_id: alert.supplier_id || null,
      alert_type: alert.type,
      severity: alert.severity,
      title: alert.title,
      description: alert.description,
      metadata: alert.metadata,
    }));

    const { error: insertError } = await (supabase as any)
      .from("pricing_alerts")
      .insert(rows);

    if (insertError) {
      console.error("[alert-generator] Failed to save alerts:", insertError);
    }
  }

  return alerts;
}
