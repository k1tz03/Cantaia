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
  /** Number of price requests actually sent to this supplier (real transactions). */
  requests_sent: number;
  /** Number of those requests the supplier answered. */
  responses_received: number;
  /**
   * False when no price request has ever been sent to this supplier. The caller
   * MUST NOT persist zeroed statistics in that case — see
   * `recalculateAndPersistScore`.
   */
  has_data: boolean;
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

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Calculate supplier score from real transaction data.
 *
 * H1: the previous implementation read `price_requests` and `supplier_offers`
 * (the legacy 012 tables), which the Submissions module has never written to.
 * Every query came back empty, so each received quote rewrote the supplier's
 * statistics with zeros and left `overall_score` pinned at the neutral value.
 *
 * The live tables are:
 *   submission_price_requests  (sent_at, status, response_received_at, response_time_days)
 *   submission_quotes          (request_id, item_id, unit_price_ht)
 * scoped to the organization through submissions.organization_id.
 *
 * The five dimensions and their weights are unchanged.
 * All DB queries degrade gracefully; missing data yields the neutral score (50)
 * rather than 0, and `has_data` tells the caller not to persist empty stats.
 */
export async function calculateAutoScore(
  supplierId: string,
  orgId: string,
  adminClient: any
): Promise<AutoScoreBreakdown> {
  // ---------- 0. Real price requests sent to this supplier ----------
  type RequestRow = {
    id: string;
    submission_id: string;
    sent_at: string | null;
    status: string | null;
    response_received_at: string | null;
    response_time_days: number | null;
  };
  let requests: RequestRow[] = [];
  try {
    const { data, error } = await (adminClient as any)
      .from("submission_price_requests")
      .select(
        "id, submission_id, sent_at, status, response_received_at, response_time_days, submissions!inner(organization_id)"
      )
      .eq("supplier_id", supplierId)
      .eq("submissions.organization_id", orgId);

    if (error) {
      // response_* columns land with migration 082 — retry without them
      console.warn("[auto-score] price request query failed, retrying minimal:", error.message);
      const retry = await (adminClient as any)
        .from("submission_price_requests")
        .select("id, submission_id, sent_at, status, submissions!inner(organization_id)")
        .eq("supplier_id", supplierId)
        .eq("submissions.organization_id", orgId);
      requests = (retry.data || []).map((r: any) => ({
        ...r,
        response_received_at: null,
        response_time_days: null,
      }));
    } else {
      requests = (data || []) as RequestRow[];
    }
  } catch (err) {
    console.warn("[auto-score] price request query threw:", err);
  }

  const requestIds = requests.map((r) => r.id);
  const requestById = new Map<string, RequestRow>(requests.map((r) => [r.id, r]));

  // ---------- 0b. Quotes actually received for those requests ----------
  type QuoteRow = { request_id: string; item_id: string | null; unit_price_ht: number | null; extracted_at: string | null };
  let quotes: QuoteRow[] = [];
  if (requestIds.length > 0) {
    try {
      const { data, error } = await (adminClient as any)
        .from("submission_quotes")
        .select("request_id, item_id, unit_price_ht, extracted_at")
        .in("request_id", requestIds);
      if (error) console.warn("[auto-score] quotes query failed:", error.message);
      quotes = (data || []) as QuoteRow[];
    } catch (err) {
      console.warn("[auto-score] quotes query threw:", err);
    }
  }

  const requestIdsWithQuotes = new Set(quotes.map((q) => q.request_id));

  // A request counts as answered when the pipeline flagged it, or when at least
  // one price was extracted from the supplier's reply.
  const isAnswered = (r: RequestRow) =>
    r.status === "responded" || !!r.response_received_at || requestIdsWithQuotes.has(r.id);

  // Only requests that actually left the mailbox are part of the denominator (H2).
  const sentRequests = requests.filter((r) => !!r.sent_at || r.status === "sent" || r.status === "responded");
  const answeredRequests = sentRequests.filter(isAnswered);

  // ---------- 1. Response time ----------
  let avgResponseDays: number | null = null;
  {
    const days: number[] = [];
    for (const r of answeredRequests) {
      // Prefer the pre-computed column (migration 082)
      if (r.response_time_days != null && Number.isFinite(Number(r.response_time_days))) {
        const d = Number(r.response_time_days);
        if (d >= 0 && d < 365) days.push(d);
        continue;
      }
      if (!r.sent_at) continue;
      // Fall back to the response timestamp, then to the first extracted quote
      const receivedIso =
        r.response_received_at ||
        quotes
          .filter((q) => q.request_id === r.id && q.extracted_at)
          .map((q) => q.extracted_at as string)
          .sort()[0];
      if (!receivedIso) continue;
      const diffDays = (new Date(receivedIso).getTime() - new Date(r.sent_at).getTime()) / (1000 * 60 * 60 * 24);
      if (diffDays >= 0 && diffDays < 365) days.push(diffDays);
    }
    if (days.length > 0) {
      avgResponseDays = Math.round((days.reduce((a, b) => a + b, 0) / days.length) * 10) / 10;
    }
  }

  // ---------- 2. Price competitiveness ----------
  // Primary: this supplier's unit price vs the median of every quote received on
  // the SAME submission item (i.e. its direct competitors on that call for bids).
  let avgVsMedianPct: number | null = null;
  {
    const ratios: number[] = [];
    const myPriceByItem = new Map<string, number>();
    for (const q of quotes) {
      if (!q.item_id || q.unit_price_ht == null) continue;
      const price = Number(q.unit_price_ht);
      if (!Number.isFinite(price) || price <= 0) continue;
      // Keep the lowest price the supplier offered on that item
      const current = myPriceByItem.get(q.item_id);
      if (current == null || price < current) myPriceByItem.set(q.item_id, price);
    }

    const itemIds = Array.from(myPriceByItem.keys());
    if (itemIds.length > 0) {
      try {
        const { data: peerQuotes, error } = await (adminClient as any)
          .from("submission_quotes")
          .select("item_id, unit_price_ht")
          .in("item_id", itemIds)
          .not("unit_price_ht", "is", null);

        if (error) {
          console.warn("[auto-score] peer quotes query failed:", error.message);
        } else {
          const byItem: Record<string, number[]> = {};
          for (const p of peerQuotes || []) {
            const price = Number(p.unit_price_ht);
            if (!Number.isFinite(price) || price <= 0) continue;
            (byItem[p.item_id] ||= []).push(price);
          }
          for (const [itemId, myPrice] of myPriceByItem) {
            const prices = byItem[itemId] || [];
            // Need at least one competitor to make the comparison meaningful
            if (prices.length < 2) continue;
            const med = median(prices);
            if (med && med > 0) ratios.push(myPrice / med);
          }
        }
      } catch (err) {
        console.warn("[auto-score] peer quotes query threw:", err);
      }
    }

    // Fallback: C2 market benchmarks on the imported price history
    // (offer_line_items — populated by the Cantaia Prix ingestion pipeline).
    if (ratios.length === 0) {
      try {
        const { data: lineItems } = await (adminClient as any)
          .from("offer_line_items")
          .select("unit_price, cfc_subcode")
          .eq("supplier_id", supplierId)
          .eq("organization_id", orgId)
          .not("unit_price", "is", null);

        const cfcCodes = Array.from(
          new Set<string>((lineItems || []).filter((li: any) => li.cfc_subcode).map((li: any) => li.cfc_subcode))
        );
        if (cfcCodes.length > 0) {
          const { data: benchmarks } = await (adminClient as any)
            .from("market_benchmarks")
            .select("cfc_code, price_median")
            .in("cfc_code", cfcCodes)
            .gte("contributor_count", 3)
            .not("price_median", "is", null);

          const benchmarkMap: Record<string, number> = {};
          for (const b of benchmarks || []) benchmarkMap[b.cfc_code] = parseFloat(b.price_median);

          for (const li of lineItems || []) {
            const price = parseFloat(li.unit_price);
            if (!price || price <= 0) continue;
            const ref = li.cfc_subcode ? benchmarkMap[li.cfc_subcode] : undefined;
            if (ref && ref > 0) ratios.push(price / ref);
          }
        }
      } catch (err) {
        console.warn("[auto-score] benchmark fallback failed:", err);
      }
    }

    if (ratios.length > 0) {
      avgVsMedianPct = ratios.reduce((a, b) => a + b, 0) / ratios.length;
    }
  }

  // ---------- 3. Response rate ----------
  const requestsCount = sentRequests.length;
  const offersCount = answeredRequests.length;
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
  // An award is recorded as submissions.budget_estimate.awarded_request_id.
  let projectsDelivered = 0;
  if (requestIds.length > 0) {
    try {
      const submissionIds = Array.from(new Set(requests.map((r) => r.submission_id).filter(Boolean)));
      if (submissionIds.length > 0) {
        const { data: subs, error } = await (adminClient as any)
          .from("submissions")
          .select("id, project_id, budget_estimate")
          .in("id", submissionIds)
          .eq("organization_id", orgId);

        if (error) {
          console.warn("[auto-score] awarded submissions query failed:", error.message);
        } else {
          const awardedProjects = new Set<string>();
          for (const s of subs || []) {
            const awardedId = s?.budget_estimate?.awarded_request_id;
            if (awardedId && requestById.has(awardedId) && s.project_id) {
              awardedProjects.add(s.project_id);
            }
          }
          projectsDelivered = awardedProjects.size;
        }
      }
    } catch (err) {
      console.warn("[auto-score] awarded submissions query threw:", err);
    }
  }

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
      // No transaction history at all → neutral, not the "0 project" floor (20).
      score: requestsCount === 0 ? 50 : scoreProjectsDelivered(projectsDelivered),
      weight: WEIGHTS.projects_delivered,
      count: projectsDelivered,
    },
    overall: 0,
    requests_sent: requestsCount,
    responses_received: offersCount,
    has_data: requestsCount > 0,
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
 *
 * H1: when the supplier has no transaction history, NOTHING is written. The old
 * implementation unconditionally wrote `total_requests_sent: 0`,
 * `total_offers_received: 0` and a response rate of 0 — so every quote received
 * wiped the supplier's statistics (and any figure imported or entered manually)
 * before the second update could restore them from tables that were always empty.
 *
 * Statistics are now written in a single statement, and only the dimensions that
 * are actually backed by data are included.
 */
export async function recalculateAndPersistScore(
  supplierId: string,
  orgId: string,
  adminClient: any
): Promise<AutoScoreBreakdown> {
  const breakdown = await calculateAutoScore(supplierId, orgId, adminClient);

  if (!breakdown.has_data) {
    // Neutral score, existing statistics preserved.
    console.log(
      `[auto-score] Supplier ${supplierId}: no price request history — keeping existing stats ` +
      `(neutral score would be ${breakdown.overall})`
    );
    return breakdown;
  }

  const updates: Record<string, unknown> = {
    overall_score: breakdown.overall,
    response_rate: breakdown.response_rate.rate_pct,
    price_competitiveness: breakdown.price_competitiveness.score,
    total_requests_sent: breakdown.requests_sent,
    total_offers_received: breakdown.responses_received,
  };

  // Only overwrite the delay when at least one response could be timed,
  // and the project count when at least one award exists.
  if (breakdown.response_time.avg_days != null) {
    updates.avg_response_days = breakdown.response_time.avg_days;
  }
  if (breakdown.projects_delivered.count > 0) {
    updates.total_projects_involved = breakdown.projects_delivered.count;
  }

  const { error } = await (adminClient as any)
    .from("suppliers")
    .update(updates)
    .eq("id", supplierId)
    .eq("organization_id", orgId);

  if (error) {
    console.error(`[auto-score] Failed to persist score for ${supplierId}:`, error.message);
  } else {
    console.log(
      `[auto-score] Updated supplier ${supplierId}: overall=${breakdown.overall} ` +
      `(${breakdown.responses_received}/${breakdown.requests_sent} responses, ` +
      `avg ${breakdown.response_time.avg_days ?? "—"} d)`
    );
  }

  return breakdown;
}

// ---------- Swiss geo zones ----------

export const GEO_ZONES = [
  "VD", "GE", "FR", "VS", "NE", "JU", "BE", "ZH", "BS", "BL",
  "AG", "SO", "LU", "SG", "TG", "SZ", "ZG", "TI", "GR",
  "national", "international",
] as const;
