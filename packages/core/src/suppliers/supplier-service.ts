// ============================================================
// Cantaia — Supplier Service
// CRUD + Scoring automatique
// ============================================================

import type { Supplier, SupplierStatus } from "@cantaia/database";

// ---------- Interfaces ----------

export interface SupplierFilters {
  specialty?: string;
  geo_zone?: string;
  status?: SupplierStatus;
  min_score?: number;
  search?: string;
  cfc_code?: string;
}

export interface SupplierScoreInput {
  total_requests_sent: number;
  total_offers_received: number;
  avg_response_days: number;
  price_competitiveness: number; // 1-100, higher = more competitive
  reliability_score: number; // 0-100
  manual_rating: number; // 0-5
}

// ---------- Scoring ----------

/**
 * Calculate supplier overall score (0-100)
 * Weighted: response_rate × 0.25 + competitiveness × 0.35 + reliability × 0.25 + manual_rating × 0.15
 */
export function calculateSupplierScore(input: SupplierScoreInput): {
  response_rate: number;
  overall_score: number;
} {
  const response_rate =
    input.total_requests_sent > 0
      ? (input.total_offers_received / input.total_requests_sent) * 100
      : 0;

  // Normalize manual_rating from 0-5 to 0-100
  const manualNormalized = (input.manual_rating / 5) * 100;

  const overall_score =
    response_rate * 0.25 +
    input.price_competitiveness * 0.35 +
    input.reliability_score * 0.25 +
    manualNormalized * 0.15;

  return {
    response_rate: Math.round(response_rate * 100) / 100,
    overall_score: Math.round(overall_score * 100) / 100,
  };
}

// ---------- Filtering ----------

export function filterSuppliers(
  suppliers: Supplier[],
  filters: SupplierFilters
): Supplier[] {
  return suppliers.filter((s) => {
    if (filters.specialty && !s.specialties.includes(filters.specialty)) {
      return false;
    }
    if (filters.geo_zone && s.geo_zone !== filters.geo_zone) {
      return false;
    }
    if (filters.status && s.status !== filters.status) {
      return false;
    }
    if (filters.min_score && s.overall_score < filters.min_score) {
      return false;
    }
    if (filters.cfc_code && !s.cfc_codes.includes(filters.cfc_code)) {
      return false;
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      const matchesName = s.company_name.toLowerCase().includes(q);
      const matchesEmail = s.email?.toLowerCase().includes(q) || false;
      const matchesContact = s.contact_name?.toLowerCase().includes(q) || false;
      const matchesCity = s.city?.toLowerCase().includes(q) || false;
      if (!matchesName && !matchesEmail && !matchesContact && !matchesCity) {
        return false;
      }
    }
    return true;
  });
}

// ---------- Specialties ----------

export const SUPPLIER_SPECIALTIES = [
  "gros_oeuvre",
  "electricite",
  "cvc",
  "sanitaire",
  "peinture",
  "menuiserie",
  "etancheite",
  "facades",
  "serrurerie",
  "carrelage",
  "platrerie",
  "charpente",
  "couverture",
  "ascenseur",
  "amenagement_exterieur",
  "demolition",
  "terrassement",
  "echafaudage",
] as const;

export type SupplierSpecialty = (typeof SUPPLIER_SPECIALTIES)[number];

export const SPECIALTY_LABELS: Record<SupplierSpecialty, { fr: string; en: string; de: string }> = {
  gros_oeuvre: { fr: "Gros-œuvre", en: "Structural work", de: "Rohbau" },
  electricite: { fr: "Électricité", en: "Electrical", de: "Elektrik" },
  cvc: { fr: "CVC", en: "HVAC", de: "HLK" },
  sanitaire: { fr: "Sanitaire", en: "Plumbing", de: "Sanitär" },
  peinture: { fr: "Peinture", en: "Painting", de: "Malerei" },
  menuiserie: { fr: "Menuiserie", en: "Carpentry", de: "Schreinerei" },
  etancheite: { fr: "Étanchéité", en: "Waterproofing", de: "Abdichtung" },
  facades: { fr: "Façades", en: "Facades", de: "Fassaden" },
  serrurerie: { fr: "Serrurerie", en: "Metalwork", de: "Schlosserei" },
  carrelage: { fr: "Carrelage", en: "Tiling", de: "Plattenleger" },
  platrerie: { fr: "Plâtrerie", en: "Plastering", de: "Gipserei" },
  charpente: { fr: "Charpente", en: "Timber framing", de: "Zimmerei" },
  couverture: { fr: "Couverture", en: "Roofing", de: "Dachdecker" },
  ascenseur: { fr: "Ascenseur", en: "Elevator", de: "Aufzug" },
  amenagement_exterieur: { fr: "Aménagement ext.", en: "Landscaping", de: "Aussenanlagen" },
  demolition: { fr: "Démolition", en: "Demolition", de: "Abbruch" },
  terrassement: { fr: "Terrassement", en: "Earthworks", de: "Erdbau" },
  echafaudage: { fr: "Échafaudage", en: "Scaffolding", de: "Gerüstbau" },
};

// ---------- Auto Score ----------

export interface AutoScoreBreakdown {
  response_time: { score: number; weight: number; avg_days: number | null };
  price_competitiveness: { score: number; weight: number; avg_vs_median_pct: number | null };
  response_rate: { score: number; weight: number; rate_pct: number };
  quality: { score: number; weight: number; source: "manual" | "neutral" };
  projects_delivered: { score: number; weight: number; count: number };
  overall: number;
}

const WEIGHTS = {
  response_time: 0.30,
  price_competitiveness: 0.25,
  response_rate: 0.20,
  quality: 0.15,
  projects_delivered: 0.10,
} as const;

function scoreResponseTime(avgDays: number | null): number {
  if (avgDays == null) return 50;
  if (avgDays < 2) return 100;
  if (avgDays < 5) return 80;
  if (avgDays < 10) return 60;
  if (avgDays < 20) return 40;
  return 20;
}

function scorePriceCompetitiveness(avgVsMedianPct: number | null): number {
  if (avgVsMedianPct == null) return 50;
  // avgVsMedianPct: ratio of supplier price vs median (e.g., 0.95 = 5% below median)
  if (avgVsMedianPct < 0.90) return 100;
  if (avgVsMedianPct <= 1.00) return 80;
  if (avgVsMedianPct <= 1.10) return 60;
  if (avgVsMedianPct <= 1.20) return 40;
  return 20;
}

function scoreResponseRate(ratePct: number): number {
  if (ratePct > 90) return 100;
  if (ratePct > 70) return 80;
  if (ratePct > 50) return 60;
  if (ratePct > 30) return 40;
  return 20;
}

function scoreProjectsDelivered(count: number): number {
  if (count > 5) return 100;
  if (count >= 3) return 80;
  if (count === 2) return 60;
  if (count === 1) return 40;
  return 20;
}

/**
 * Calculate supplier score from real transaction data.
 * All DB queries use try/catch for graceful degradation.
 */
export async function calculateAutoScore(
  supplierId: string,
  orgId: string,
  adminClient: any
): Promise<AutoScoreBreakdown> {
  // ---------- 1. Response time ----------
  let avgResponseDays: number | null = null;
  try {
    // Join price_requests → supplier_offers via price_request_id
    const { data: prData } = await (adminClient as any)
      .from("price_requests")
      .select("id, created_at, sent_at")
      .eq("supplier_id", supplierId)
      .eq("organization_id", orgId);

    if (prData && prData.length > 0) {
      const prIds = prData.map((pr: any) => pr.id);
      const { data: offers } = await (adminClient as any)
        .from("supplier_offers")
        .select("price_request_id, created_at, received_at")
        .eq("supplier_id", supplierId)
        .eq("organization_id", orgId)
        .in("price_request_id", prIds);

      if (offers && offers.length > 0) {
        const prMap: Record<string, any> = {};
        for (const pr of prData) prMap[pr.id] = pr;

        const days: number[] = [];
        for (const offer of offers) {
          const pr = prMap[offer.price_request_id];
          if (!pr) continue;
          const sentDate = pr.sent_at || pr.created_at;
          const receivedDate = offer.received_at || offer.created_at;
          if (!sentDate || !receivedDate) continue;
          const diffDays = (new Date(receivedDate).getTime() - new Date(sentDate).getTime()) / (1000 * 60 * 60 * 24);
          if (diffDays > 0 && diffDays < 365) days.push(diffDays);
        }
        if (days.length > 0) {
          avgResponseDays = Math.round((days.reduce((a, b) => a + b, 0) / days.length) * 10) / 10;
        }
      }
    }
  } catch (err) {
    console.warn("[auto-score] Response time query failed:", err);
  }

  // ---------- 2. Price competitiveness ----------
  let avgVsMedianPct: number | null = null;
  try {
    // Get this supplier's line items with CFC codes
    const { data: lineItems } = await (adminClient as any)
      .from("offer_line_items")
      .select("unit_price, cfc_subcode, submission_item_id")
      .eq("supplier_id", supplierId)
      .eq("organization_id", orgId)
      .not("unit_price", "is", null);

    if (lineItems && lineItems.length > 0) {
      const ratios: number[] = [];

      // Strategy A: Compare vs market_benchmarks for items with cfc_subcode
      const cfcCodes = [...new Set(lineItems.filter((li: any) => li.cfc_subcode).map((li: any) => li.cfc_subcode))];
      let benchmarkMap: Record<string, number> = {};
      if (cfcCodes.length > 0) {
        try {
          const { data: benchmarks } = await (adminClient as any)
            .from("market_benchmarks")
            .select("cfc_code, price_median")
            .in("cfc_code", cfcCodes)
            .not("price_median", "is", null);
          if (benchmarks) {
            for (const b of benchmarks) {
              benchmarkMap[b.cfc_code] = parseFloat(b.price_median);
            }
          }
        } catch { /* table may not exist */ }
      }

      // Strategy B: Compare vs other suppliers' prices for the same submission items
      const itemIds = [...new Set(lineItems.filter((li: any) => li.submission_item_id).map((li: any) => li.submission_item_id))];
      let itemMedianMap: Record<string, number> = {};
      if (itemIds.length > 0) {
        try {
          const { data: allItemPrices } = await (adminClient as any)
            .from("offer_line_items")
            .select("submission_item_id, unit_price")
            .in("submission_item_id", itemIds)
            .eq("organization_id", orgId)
            .not("unit_price", "is", null);
          if (allItemPrices && allItemPrices.length > 0) {
            const grouped: Record<string, number[]> = {};
            for (const p of allItemPrices) {
              if (!grouped[p.submission_item_id]) grouped[p.submission_item_id] = [];
              grouped[p.submission_item_id].push(parseFloat(p.unit_price));
            }
            for (const [itemId, prices] of Object.entries(grouped)) {
              if (prices.length >= 2) {
                const sorted = prices.sort((a, b) => a - b);
                const mid = Math.floor(sorted.length / 2);
                itemMedianMap[itemId] = sorted.length % 2 === 0
                  ? (sorted[mid - 1] + sorted[mid]) / 2
                  : sorted[mid];
              }
            }
          }
        } catch { /* ignore */ }
      }

      // Calculate ratios
      for (const li of lineItems) {
        const price = parseFloat(li.unit_price);
        if (!price || price <= 0) continue;

        // Try benchmark first
        if (li.cfc_subcode && benchmarkMap[li.cfc_subcode]) {
          ratios.push(price / benchmarkMap[li.cfc_subcode]);
          continue;
        }

        // Then try peer comparison
        if (li.submission_item_id && itemMedianMap[li.submission_item_id]) {
          ratios.push(price / itemMedianMap[li.submission_item_id]);
          continue;
        }
      }

      if (ratios.length > 0) {
        avgVsMedianPct = ratios.reduce((a, b) => a + b, 0) / ratios.length;
      }
    }
  } catch (err) {
    console.warn("[auto-score] Price competitiveness query failed:", err);
  }

  // ---------- 3. Response rate ----------
  let requestsCount = 0;
  let offersCount = 0;
  try {
    const { count: rc } = await (adminClient as any)
      .from("price_requests")
      .select("id", { count: "exact", head: true })
      .eq("supplier_id", supplierId)
      .eq("organization_id", orgId);
    requestsCount = rc || 0;
  } catch { /* ignore */ }

  try {
    const { count: oc } = await (adminClient as any)
      .from("supplier_offers")
      .select("id", { count: "exact", head: true })
      .eq("supplier_id", supplierId)
      .eq("organization_id", orgId);
    offersCount = oc || 0;
  } catch { /* ignore */ }

  const ratePct = requestsCount > 0 ? Math.round((offersCount / requestsCount) * 100) : 0;

  // ---------- 4. Quality (manual reliability_score) ----------
  let reliabilityScore: number | null = null;
  let qualitySource: "manual" | "neutral" = "neutral";
  try {
    const { data: supplier } = await (adminClient as any)
      .from("suppliers")
      .select("reliability_score")
      .eq("id", supplierId)
      .maybeSingle();
    if (supplier?.reliability_score != null && supplier.reliability_score > 0) {
      reliabilityScore = parseFloat(supplier.reliability_score);
      qualitySource = "manual";
    }
  } catch { /* ignore */ }

  // ---------- 5. Projects delivered ----------
  let projectsDelivered = 0;
  try {
    const { data: awardedOffers } = await (adminClient as any)
      .from("supplier_offers")
      .select("project_id, status")
      .eq("supplier_id", supplierId)
      .eq("organization_id", orgId)
      .in("status", ["awarded", "completed"]);

    if (awardedOffers && awardedOffers.length > 0) {
      const uniqueProjects = new Set(awardedOffers.map((o: any) => o.project_id).filter(Boolean));
      projectsDelivered = uniqueProjects.size;
    }
  } catch { /* ignore */ }

  // ---------- Build breakdown ----------
  const breakdown: AutoScoreBreakdown = {
    response_time: {
      score: scoreResponseTime(avgResponseDays),
      weight: WEIGHTS.response_time,
      avg_days: avgResponseDays,
    },
    price_competitiveness: {
      score: scorePriceCompetitiveness(avgVsMedianPct),
      weight: WEIGHTS.price_competitiveness,
      avg_vs_median_pct: avgVsMedianPct,
    },
    response_rate: {
      score: requestsCount === 0 ? 50 : scoreResponseRate(ratePct),
      weight: WEIGHTS.response_rate,
      rate_pct: ratePct,
    },
    quality: {
      score: reliabilityScore != null ? reliabilityScore : 50,
      weight: WEIGHTS.quality,
      source: qualitySource,
    },
    projects_delivered: {
      score: scoreProjectsDelivered(projectsDelivered),
      weight: WEIGHTS.projects_delivered,
      count: projectsDelivered,
    },
    overall: 0,
  };

  // Weighted average
  breakdown.overall = Math.round(
    breakdown.response_time.score * breakdown.response_time.weight +
    breakdown.price_competitiveness.score * breakdown.price_competitiveness.weight +
    breakdown.response_rate.score * breakdown.response_rate.weight +
    breakdown.quality.score * breakdown.quality.weight +
    breakdown.projects_delivered.score * breakdown.projects_delivered.weight
  );

  return breakdown;
}

/**
 * Calculate and persist auto-score for a supplier.
 * Updates overall_score, response_rate, avg_response_days, price_competitiveness in DB.
 */
export async function recalculateAndPersistScore(
  supplierId: string,
  orgId: string,
  adminClient: any
): Promise<AutoScoreBreakdown> {
  const breakdown = await calculateAutoScore(supplierId, orgId, adminClient);

  try {
    await (adminClient as any)
      .from("suppliers")
      .update({
        overall_score: breakdown.overall,
        response_rate: breakdown.response_rate.rate_pct,
        avg_response_days: breakdown.response_time.avg_days ?? 0,
        price_competitiveness: breakdown.price_competitiveness.score,
        total_requests_sent: 0, // Will be updated separately
        total_offers_received: 0,
      })
      .eq("id", supplierId)
      .eq("organization_id", orgId);

    // Also update the stats counts
    try {
      const { count: rc } = await (adminClient as any)
        .from("price_requests")
        .select("id", { count: "exact", head: true })
        .eq("supplier_id", supplierId)
        .eq("organization_id", orgId);

      const { count: oc } = await (adminClient as any)
        .from("supplier_offers")
        .select("id", { count: "exact", head: true })
        .eq("supplier_id", supplierId)
        .eq("organization_id", orgId);

      const { data: awardedOffers } = await (adminClient as any)
        .from("supplier_offers")
        .select("project_id")
        .eq("supplier_id", supplierId)
        .eq("organization_id", orgId)
        .in("status", ["awarded", "completed"]);

      const projectCount = awardedOffers
        ? new Set(awardedOffers.map((o: any) => o.project_id).filter(Boolean)).size
        : 0;

      await (adminClient as any)
        .from("suppliers")
        .update({
          total_requests_sent: rc || 0,
          total_offers_received: oc || 0,
          total_projects_involved: projectCount,
        })
        .eq("id", supplierId)
        .eq("organization_id", orgId);
    } catch { /* non-critical */ }

    console.log(`[auto-score] Updated supplier ${supplierId}: overall=${breakdown.overall}`);
  } catch (err) {
    console.error(`[auto-score] Failed to persist score for ${supplierId}:`, err);
  }

  return breakdown;
}

// ---------- Swiss geo zones ----------

export const GEO_ZONES = [
  "VD", "GE", "FR", "VS", "NE", "JU", "BE", "ZH", "BS", "BL",
  "AG", "SO", "LU", "SG", "TG", "SZ", "ZG", "TI", "GR",
  "national", "international",
] as const;
