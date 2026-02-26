// ============================================================
// Cantaia — Supplier Matcher
// Match suppliers to submission lots based on specialties,
// geo zone, score, and cross-project history.
// ============================================================

import type { Supplier, SubmissionLot } from "@cantaia/database";

export interface SupplierMatch {
  supplier_id: string;
  supplier_name: string;
  relevance_score: number; // 0-100
  reasons: string[];
}

// CFC code → specialty mapping
const CFC_TO_SPECIALTY: Record<string, string[]> = {
  "113": ["terrassement", "demolition"],
  "211": ["gros_oeuvre"],
  "212": ["gros_oeuvre"],
  "214": ["facades"],
  "215": ["gros_oeuvre"],
  "224": ["etancheite"],
  "226": ["etancheite"],
  "227": ["etancheite"],
  "232": ["electricite"],
  "233": ["electricite"],
  "235": ["electricite"],
  "242": ["cvc"],
  "244": ["cvc"],
  "245": ["cvc"],
  "251": ["sanitaire"],
  "271": ["platrerie", "peinture"],
  "281": ["peinture"],
  "283": ["carrelage"],
};

/**
 * Match suppliers to a specific lot based on CFC code, specialties, geo zone, and score
 */
export function matchSuppliersToLot(
  lot: SubmissionLot,
  suppliers: Supplier[],
  projectLocation?: string
): SupplierMatch[] {
  const matches: SupplierMatch[] = [];
  const requiredSpecialties = lot.cfc_code ? CFC_TO_SPECIALTY[lot.cfc_code] || [] : [];

  for (const supplier of suppliers) {
    if (supplier.status === "blacklisted" || supplier.status === "inactive") continue;

    let score = 0;
    const reasons: string[] = [];

    // Specialty match (0-40 points)
    const specialtyMatch = requiredSpecialties.some((sp) =>
      supplier.specialties.includes(sp)
    );
    if (specialtyMatch) {
      score += 40;
      reasons.push("specialty_match");
    } else if (lot.cfc_code && supplier.cfc_codes.includes(lot.cfc_code)) {
      score += 35;
      reasons.push("cfc_match");
    } else {
      continue; // Skip suppliers with no relevant specialty
    }

    // Score bonus (0-25 points)
    score += (supplier.overall_score / 100) * 25;
    if (supplier.overall_score >= 80) reasons.push("high_score");

    // Response rate bonus (0-15 points)
    score += (supplier.response_rate / 100) * 15;
    if (supplier.response_rate >= 85) reasons.push("reliable_responder");

    // Preferred supplier bonus (10 points)
    if (supplier.status === "preferred") {
      score += 10;
      reasons.push("preferred");
    }

    // Geo zone bonus (0-10 points)
    if (supplier.geo_zone === "national") {
      score += 5;
    } else if (projectLocation && supplier.geo_zone === projectLocation) {
      score += 10;
      reasons.push("local");
    }

    matches.push({
      supplier_id: supplier.id,
      supplier_name: supplier.company_name,
      relevance_score: Math.min(100, Math.round(score)),
      reasons,
    });
  }

  return matches.sort((a, b) => b.relevance_score - a.relevance_score);
}

/**
 * Match suppliers to all lots of a submission
 */
export function matchSuppliersToAllLots(
  lots: SubmissionLot[],
  suppliers: Supplier[],
  projectLocation?: string
): Record<string, SupplierMatch[]> {
  const result: Record<string, SupplierMatch[]> = {};
  for (const lot of lots) {
    result[lot.id] = matchSuppliersToLot(lot, suppliers, projectLocation);
  }
  return result;
}
